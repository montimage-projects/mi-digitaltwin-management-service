import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScenarioForm } from './ScenarioForm';
import type { Scenario } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  infrastructuresApi: { list: vi.fn().mockResolvedValue([]) },
}));

function renderForm(scenario?: Partial<Scenario>) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ScenarioForm scenario={scenario as Scenario} onSubmit={onSubmit} isSubmitting={false} />
    </QueryClientProvider>
  );
  return onSubmit;
}

describe('ScenarioForm — observability option', () => {
  it('is on by default and submitted with the scenario', async () => {
    const onSubmit = renderForm();
    const box = screen.getByRole('checkbox', { name: 'Collect observability data' });
    expect(box).toBeChecked();

    await userEvent.type(screen.getByLabelText('Title *'), 'Web scenario');
    await userEvent.click(screen.getByRole('button', { name: 'Create Scenario' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Web scenario', observability: true })
      )
    );
  });

  it('can be turned off', async () => {
    const onSubmit = renderForm();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Collect observability data' }));
    await userEvent.type(screen.getByLabelText('Title *'), 'Quiet scenario');
    await userEvent.click(screen.getByRole('button', { name: 'Create Scenario' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ observability: false }))
    );
  });

  it('reflects a saved opt-out', () => {
    renderForm({ title: 'Saved', observability: false });
    expect(screen.getByRole('checkbox', { name: 'Collect observability data' })).not.toBeChecked();
  });

  it('treats an older scenario without the field as on', () => {
    renderForm({ title: 'Legacy' });
    expect(screen.getByRole('checkbox', { name: 'Collect observability data' })).toBeChecked();
  });
});
