import { describe, it, expect, beforeEach } from 'vitest';
import { useTourStore } from './tour-store';

function persisted() {
  const raw = localStorage.getItem('tour-storage');
  return raw ? JSON.parse(raw).state : null;
}

describe('useTourStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useTourStore.setState({ status: 'idle', stepIndex: 0 });
  });

  it('starts idle and never auto-launches', () => {
    expect(useTourStore.getState().status).toBe('idle');
    expect(useTourStore.getState().stepIndex).toBe(0);
  });

  it('start() opens the tour at the first step, even after a previous run', () => {
    useTourStore.setState({ status: 'completed', stepIndex: 4 });
    useTourStore.getState().start();
    expect(useTourStore.getState()).toMatchObject({ status: 'active', stepIndex: 0 });
  });

  it('next() advances but never past the last step', () => {
    const { start, next } = useTourStore.getState();
    start();
    next(3);
    expect(useTourStore.getState().stepIndex).toBe(1);
    next(3);
    next(3);
    next(3);
    expect(useTourStore.getState().stepIndex).toBe(2);
  });

  it('prev() goes back but never below the first step', () => {
    const { start, next, prev } = useTourStore.getState();
    start();
    next(3);
    prev();
    expect(useTourStore.getState().stepIndex).toBe(0);
    prev();
    expect(useTourStore.getState().stepIndex).toBe(0);
  });

  it('dismiss() closes the tour and resets the step', () => {
    const { start, next, dismiss } = useTourStore.getState();
    start();
    next(5);
    dismiss();
    expect(useTourStore.getState()).toMatchObject({ status: 'dismissed', stepIndex: 0 });
  });

  it('complete() closes the tour as completed', () => {
    const { start, complete } = useTourStore.getState();
    start();
    complete();
    expect(useTourStore.getState()).toMatchObject({ status: 'completed', stepIndex: 0 });
  });

  it('persists only the outcome, never the step', () => {
    const { start, next, complete } = useTourStore.getState();
    start();
    next(5);
    complete();
    expect(persisted()).toEqual({ status: 'completed' });
  });

  it('never persists an in-progress tour, so a reload does not re-open it', () => {
    const { start, next } = useTourStore.getState();
    start();
    next(5);
    expect(useTourStore.getState().status).toBe('active');
    expect(persisted()).toEqual({ status: 'idle' });
  });
});
