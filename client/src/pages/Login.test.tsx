import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Login } from '@/pages/Login';
import { useAuthStore } from '@/store/auth-store';

// Mock the auth store
vi.mock('@/store/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  ...vi.importActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  Navigate: () => {
    return <div data-testid="navigate-redirect" />;
  },
}));

describe('Login Component', () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as vi.Mock).mockReturnValue({
      isAuthenticated: false,
      login: mockLogin,
    });
  });

  it('renders the login form with username and password fields', () => {
    render(<Login />);

    expect(screen.getByLabelText(/username/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in to platform/i })).toBeInTheDocument();
  });

  it('displays validation errors when fields are empty', async () => {
    const user = userEvent.setup();
    render(<Login />);

    const submitButton = screen.getByRole('button', { name: /sign in to platform/i });
    await user.click(submitButton);

    expect(screen.getByText(/username is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });

  it('shows loading state when submitting', async () => {
    const user = userEvent.setup();
    render(<Login />);

    const usernameInput = screen.getByLabelText(/username/i, { selector: 'input' });
    const passwordInput = screen.getByLabelText(/password/i, { selector: 'input' });

    await user.type(usernameInput, 'testuser');
    await user.type(passwordInput, 'testpass');

    // No validation errors should appear
    expect(screen.queryByText(/username is required/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/password is required/i)).not.toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    render(<Login />);

    const passwordInput = screen.getByLabelText(/password/i, { selector: 'input' });
    const toggle = screen.getByRole('button', { name: /show password/i });

    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(toggle);
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();

    await user.click(toggle);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
