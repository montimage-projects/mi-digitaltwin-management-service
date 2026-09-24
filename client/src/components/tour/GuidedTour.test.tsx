import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuidedTour } from './GuidedTour';
import type { TourStep } from './tour-steps';
import { useTourStore } from '@/store/tour-store';

const STEPS: TourStep[] = [
  { id: 'intro', title: 'Intro', description: 'Welcome text' },
  { id: 'demo', title: 'Demo target', description: 'Points at the demo button', target: 'demo' },
  { id: 'last', title: 'Last step', description: 'Goodbye' },
];

const FALLBACK_STEPS: TourStep[] = [
  {
    id: 'hidden',
    title: 'Hidden target',
    description: 'Points at the demo button instead',
    target: 'missing',
    fallbackTarget: 'demo',
  },
];

function renderTour(steps: TourStep[] = STEPS) {
  return render(
    <>
      <main>
        <p>App content</p>
        <button type="button" onClick={() => useTourStore.getState().start()}>
          Launch tour
        </button>
        <button type="button" data-tour="demo" className="ring-offset-background">
          Demo button
        </button>
      </main>
      <GuidedTour steps={steps} />
    </>
  );
}

/** jsdom lays nothing out; give `[data-tour="demo"]` a real box so it counts as visible. */
function makeDemoTargetVisible() {
  const original = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.getAttribute('data-tour') === 'demo') return new DOMRect(10, 10, 120, 32);
    return original.call(this);
  });
}

describe('GuidedTour', () => {
  beforeEach(() => {
    localStorage.clear();
    useTourStore.setState({ status: 'idle', stepIndex: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing until the tour is started', () => {
    renderTour();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each(['dismissed', 'completed'] as const)('renders nothing when %s', (status) => {
    useTourStore.setState({ status });
    renderTour();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a step without a target as a centered dialog with progress', () => {
    useTourStore.getState().start();
    renderTour();

    const dialog = screen.getByRole('dialog', { name: 'Intro' });
    expect(dialog).toHaveAttribute('data-tour-placement', 'centered');
    expect(dialog).toHaveAccessibleDescription('Welcome text');
    expect(screen.getByText('Step 1 of 3')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('progressbar', { name: 'Tour progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Skip tour' })).toBeEnabled();
  });

  it('moves forward and back through the steps', async () => {
    const user = userEvent.setup();
    useTourStore.getState().start();
    renderTour();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog', { name: 'Demo target' })).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'Intro' })).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });

  it('falls back to a centered dialog when the target is not visible', async () => {
    const user = userEvent.setup();
    useTourStore.getState().start();
    renderTour();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog', { name: 'Demo target' })).toHaveAttribute(
      'data-tour-placement',
      'centered'
    );
  });

  it('anchors a step to its visible target and highlights it', async () => {
    const user = userEvent.setup();
    makeDemoTargetVisible();
    useTourStore.getState().start();
    renderTour();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    const popover = screen.getByRole('dialog', { name: 'Demo target' });
    expect(popover).toHaveAttribute('data-tour-placement', 'anchored');
    expect(popover).toHaveAccessibleDescription('Points at the demo button');
    const target = screen.getByRole('button', { name: 'Demo button' });
    expect(target).toHaveClass('ring-2');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog', { name: 'Last step' })).toBeInTheDocument();
    expect(target).not.toHaveClass('ring-2');
    // Classes the target already had are not stripped by the highlight cleanup.
    expect(target).toHaveClass('ring-offset-background');
  });

  it('anchors to the fallback target when the primary target is not visible', () => {
    makeDemoTargetVisible();
    useTourStore.getState().start();
    renderTour(FALLBACK_STEPS);

    expect(screen.getByRole('dialog', { name: 'Hidden target' })).toHaveAttribute(
      'data-tour-placement',
      'anchored'
    );
    expect(screen.getByRole('button', { name: 'Demo button' })).toHaveClass('ring-2');
  });

  it('keeps the tour running and the page usable when switching dialog to popover', async () => {
    const user = userEvent.setup();
    makeDemoTargetVisible();
    renderTour();

    // Launch from a button so Radix has an outside element to return focus to.
    await user.click(screen.getByRole('button', { name: 'Launch tour' }));
    await screen.findByRole('dialog', { name: 'Intro' });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('dialog', { name: 'Demo target' });

    // Let Radix run its deferred unmount work (focus return, scroll/aria cleanup).
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(useTourStore.getState()).toMatchObject({ status: 'active', stepIndex: 1 });
    expect(screen.getByRole('dialog', { name: 'Demo target' })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.body.style.pointerEvents).not.toBe('none');
      expect(screen.getByText('App content').closest('[aria-hidden="true"]')).toBeNull();
    });
  });

  it('keeps an anchored step open when focus moves back to the page', async () => {
    const user = userEvent.setup();
    makeDemoTargetVisible();
    useTourStore.setState({ status: 'active', stepIndex: 1 });
    renderTour();
    expect(screen.getByRole('dialog', { name: 'Demo target' })).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'Demo button' }).focus());
    await user.tab();

    expect(useTourStore.getState().status).toBe('active');
    expect(screen.getByRole('dialog', { name: 'Demo target' })).toBeInTheDocument();
  });

  it('moves focus into the current step', () => {
    useTourStore.getState().start();
    renderTour();
    expect(screen.getByRole('dialog', { name: 'Intro' })).toContainElement(
      document.activeElement as HTMLElement
    );
  });

  it('focuses the primary action when each step opens', async () => {
    const user = userEvent.setup();
    makeDemoTargetVisible();
    useTourStore.getState().start();
    renderTour();

    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog', { name: 'Demo target' })).toHaveAttribute(
      'data-tour-placement',
      'anchored'
    );
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Finish' })).toHaveFocus();
  });

  it('returns focus to the launcher when the tour finishes after several steps', async () => {
    const user = userEvent.setup();
    makeDemoTargetVisible();
    renderTour();
    const launch = screen.getByRole('button', { name: 'Launch tour' });

    await user.click(launch);
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await screen.findByRole('dialog', { name: 'Demo target' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Finish' }));

    expect(useTourStore.getState().status).toBe('completed');
    await waitFor(() => expect(launch).toHaveFocus());
  });

  it('completes the tour from the last step', async () => {
    const user = userEvent.setup();
    useTourStore.setState({ status: 'active', stepIndex: 2 });
    renderTour();

    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    expect(useTourStore.getState().status).toBe('completed');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('dismisses the tour with Skip tour', async () => {
    const user = userEvent.setup();
    useTourStore.getState().start();
    renderTour();

    await user.click(screen.getByRole('button', { name: 'Skip tour' }));

    expect(useTourStore.getState().status).toBe('dismissed');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('dismisses the tour with the dialog close button', async () => {
    const user = userEvent.setup();
    useTourStore.getState().start();
    renderTour();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(useTourStore.getState().status).toBe('dismissed');
  });

  it('dismisses a centered step with Escape', async () => {
    const user = userEvent.setup();
    useTourStore.getState().start();
    renderTour();

    await user.keyboard('{Escape}');

    expect(useTourStore.getState().status).toBe('dismissed');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('dismisses an anchored step with Escape', async () => {
    const user = userEvent.setup();
    makeDemoTargetVisible();
    useTourStore.setState({ status: 'active', stepIndex: 1 });
    renderTour();

    expect(screen.getByRole('dialog', { name: 'Demo target' })).toHaveAttribute(
      'data-tour-placement',
      'anchored'
    );
    await user.keyboard('{Escape}');

    expect(useTourStore.getState().status).toBe('dismissed');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Demo button' })).not.toHaveClass('ring-2');
  });

  it('can be restarted after being dismissed', async () => {
    const user = userEvent.setup();
    useTourStore.getState().start();
    renderTour();
    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    useTourStore.getState().start();
    expect(await screen.findByRole('dialog', { name: 'Intro' })).toBeInTheDocument();
  });
});
