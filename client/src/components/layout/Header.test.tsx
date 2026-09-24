import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from './Header';
import { useTourStore } from '@/store/tour-store';

vi.mock('@/store/auth-store', () => ({
  useAuthStore: () => ({ user: { username: 'alice', role: 'admin' }, logout: vi.fn() }),
}));

vi.mock('@/store/theme-store', () => ({
  useThemeStore: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));

describe('Header', () => {
  beforeEach(() => {
    localStorage.clear();
    useTourStore.setState({ status: 'idle', stepIndex: 0 });
  });

  it('renders a labelled help button that starts the guided tour', async () => {
    const user = userEvent.setup();
    render(<Header />);

    const help = screen.getByRole('button', { name: 'Start guided tour' });
    expect(help).toHaveAttribute('data-tour', 'help');

    await user.click(help);

    expect(useTourStore.getState()).toMatchObject({ status: 'active', stepIndex: 0 });
  });

  it('marks the mobile navigation button as a tour target', () => {
    render(<Header onMenuClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute(
      'data-tour',
      'nav-menu'
    );
  });

  it('restarts the tour from the first step after it was completed', async () => {
    const user = userEvent.setup();
    useTourStore.setState({ status: 'completed', stepIndex: 0 });
    render(<Header />);

    await user.click(screen.getByRole('button', { name: 'Start guided tour' }));

    expect(useTourStore.getState().status).toBe('active');
  });
});
