import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfigStatusBadge } from './ConfigStatusBadge';
import type { ServiceConfigInput } from '@/lib/service-config-status';

const configured: ServiceConfigInput = {
  title: 'Network Monitor',
  provider: 'Montimage',
  categoryId: { _id: 'cat-1' },
  description: 'Monitors network traffic.',
  currentVersion: '1.0.0',
  versions: [{ version: '1.0.0', dockerImage: 'registry/mmt:1.0.0' }],
};

describe('ConfigStatusBadge', () => {
  it('renders the complete state with a text label', () => {
    render(<ConfigStatusBadge service={configured} />);
    const badge = screen.getByTestId('config-status-badge-complete');
    expect(badge).toHaveTextContent('Configured');
    expect(badge).not.toHaveAttribute('aria-label');
    expect(screen.queryByTestId('config-status-badge-incomplete')).not.toBeInTheDocument();
  });

  it('renders the incomplete state with the missing items in its accessible text', () => {
    render(<ConfigStatusBadge service={{ ...configured, versions: [] }} />);
    const badge = screen.getByTestId('config-status-badge-incomplete');
    expect(badge).toHaveTextContent('Needs configuration: missing Container image');
    expect(badge).not.toHaveAttribute('aria-label');
    expect(screen.getByText(': missing Container image')).toHaveClass('sr-only');
  });

  it('makes the incomplete badge keyboard-focusable for its tooltip', () => {
    render(<ConfigStatusBadge service={{ ...configured, description: '' }} />);
    const trigger = screen.getByTestId('config-status-badge-incomplete').parentElement;
    expect(trigger).toHaveAttribute('tabindex', '0');
  });

  it('renders a plain, non-focusable badge when the tooltip is disabled', () => {
    const { container } = render(
      <ConfigStatusBadge service={{ ...configured, description: '' }} withTooltip={false} />
    );
    const badge = screen.getByTestId('config-status-badge-incomplete');
    expect(badge).toHaveTextContent('Needs configuration');
    expect(container.querySelector('[tabindex]')).toBeNull();
    expect(container.firstChild).toBe(badge);
  });

  it('updates when the service configuration changes', () => {
    const { rerender } = render(
      <ConfigStatusBadge service={{ ...configured, description: undefined }} />
    );
    expect(screen.getByTestId('config-status-badge-incomplete')).toBeInTheDocument();

    rerender(<ConfigStatusBadge service={configured} />);
    expect(screen.getByTestId('config-status-badge-complete')).toHaveTextContent('Configured');
    expect(screen.queryByTestId('config-status-badge-incomplete')).not.toBeInTheDocument();
  });
});
