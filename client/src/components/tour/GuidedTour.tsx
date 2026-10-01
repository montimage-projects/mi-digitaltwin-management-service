import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { navigation } from '@/components/layout/Sidebar';
import { useTourStore } from '@/store/tour-store';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildTourSteps, type TourStep } from './tour-steps';

const DEFAULT_STEPS = buildTourSteps(navigation);

/** Ring drawn around the element the current step points at. */
const HIGHLIGHT_CLASSES = ['ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background'];

/**
 * First element carrying `data-tour={id}` that is actually laid out. The
 * sidebar can be mounted twice (desktop + mobile drawer) and the hidden copy
 * has an empty box, so visibility — not document order — decides.
 */
function findVisibleTarget(id: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`);
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return el;
  }
  return null;
}

interface ResolvedTarget {
  element: HTMLElement | null;
  /** True when the step points at its `fallbackTarget` instead of `target`. */
  isFallback: boolean;
}

/** Visible target for a step, falling back to its alternate target (e.g. on small screens). */
function resolveTarget(step: TourStep): ResolvedTarget {
  if (!step.target) return { element: null, isFallback: false };
  const target = findVisibleTarget(step.target);
  if (target || !step.fallbackTarget) return { element: target, isFallback: false };
  return { element: findVisibleTarget(step.fallbackTarget), isFallback: true };
}

interface GuidedTourProps {
  /** Steps to walk through; defaults to the platform tour. */
  steps?: TourStep[];
}

/**
 * Guided walkthrough of the main menus and core workflow. Renders nothing
 * until started from the header help button or the Dashboard, and never
 * blocks the page once skipped, dismissed or completed.
 */
export function GuidedTour({ steps = DEFAULT_STEPS }: GuidedTourProps) {
  const status = useTourStore((state) => state.status);
  if (status !== 'active' || steps.length === 0) return null;
  return <ActiveTour steps={steps} />;
}

function ActiveTour({ steps }: { steps: TourStep[] }) {
  const storedIndex = useTourStore((state) => state.stepIndex);
  const next = useTourStore((state) => state.next);
  const prev = useTourStore((state) => state.prev);
  const dismiss = useTourStore((state) => state.dismiss);
  const complete = useTourStore((state) => state.complete);

  const index = Math.min(storedIndex, steps.length - 1);
  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  const titleId = useId();
  const descriptionId = useId();
  const anchorRef = useRef<HTMLElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  // Element that launched the tour, captured before any step takes focus.
  const [launcher] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [resolved, setResolved] = useState<({ stepId: string } & ResolvedTarget) | null>(null);

  useEffect(() => {
    const onResize = () => setLayoutVersion((version) => version + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Resolve (and highlight) the current step's target before paint.
  useLayoutEffect(() => {
    const { element: target, isFallback } = resolveTarget(step);
    anchorRef.current = target;
    setResolved({ stepId: step.id, element: target, isFallback });
    if (!target) return;
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    // Only add (and later remove) the classes the target lacks, so classes it
    // already carries (e.g. a button's ring-offset-background) survive.
    const added = HIGHLIGHT_CLASSES.filter((name) => !target.classList.contains(name));
    target.classList.add(...added);
    return () => target.classList.remove(...added);
  }, [step, layoutVersion]);

  // Each step opens with focus on its primary action (Next / Finish).
  const focusPrimary = (event: Event) => {
    event.preventDefault();
    primaryRef.current?.focus();
  };

  /**
   * Radix returns focus to the previously focused element when a step's
   * popover/dialog unmounts. While the tour is running the next step has
   * already taken focus, so keep it there. Once the tour closes, return focus
   * to the launcher (or the header help button) unless the user already moved
   * it elsewhere, e.g. by clicking outside.
   */
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (useTourStore.getState().status === 'active') return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const fallback =
      launcher && launcher.isConnected && launcher !== document.body
        ? launcher
        : findVisibleTarget('help');
    fallback?.focus();
  };

  if (!resolved || resolved.stepId !== step.id) return null;

  const progress = (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Step {index + 1} of {steps.length}
      </p>
      <Progress
        value={((index + 1) / steps.length) * 100}
        aria-label="Tour progress"
        className="h-1.5"
      />
    </div>
  );

  const controls = (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="sm" onClick={dismiss}>
        Skip tour
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={prev} disabled={isFirst}>
          Back
        </Button>
        <Button ref={primaryRef} size="sm" onClick={isLast ? complete : () => next(steps.length)}>
          {isLast ? 'Finish' : 'Next'}
        </Button>
      </div>
    </div>
  );

  if (resolved.element) {
    return (
      <Popover
        key={step.id}
        open
        onOpenChange={(open) => {
          if (!open) dismiss();
        }}
      >
        <PopoverAnchor virtualRef={anchorRef} />
        <PopoverContent
          // A fallback target (the small-screen header menu button) sits at the
          // screen edge, where a side placement would push the popover
          // off-screen; below it, collision handling keeps it in view.
          side={resolved.isFallback ? 'bottom' : (step.side ?? 'bottom')}
          sideOffset={10}
          collisionPadding={16}
          className="w-80 max-w-[calc(100vw-2rem)] space-y-4"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          data-tour-placement="anchored"
          // Tabbing back into the page should not end the tour; Esc, an outside
          // click or Skip still do.
          onFocusOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={focusPrimary}
          onCloseAutoFocus={restoreFocus}
        >
          <div className="space-y-1.5">
            <h2 id={titleId} className="font-semibold leading-none tracking-tight">
              {step.title}
            </h2>
            <p id={descriptionId} className="text-sm text-muted-foreground">
              {step.description}
            </p>
          </div>
          {progress}
          {controls}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Dialog
      key={step.id}
      open
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent
        className="max-w-md"
        data-tour-placement="centered"
        onOpenAutoFocus={focusPrimary}
        onCloseAutoFocus={restoreFocus}
      >
        <DialogHeader>
          <DialogTitle>{step.title}</DialogTitle>
          <DialogDescription>{step.description}</DialogDescription>
        </DialogHeader>
        {progress}
        <DialogFooter className="sm:justify-stretch sm:space-x-0">
          <div className="w-full">{controls}</div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
