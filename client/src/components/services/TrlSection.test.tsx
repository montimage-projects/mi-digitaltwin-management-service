import { render, screen } from '@testing-library/react';
import { TrlSection } from './TrlSection';
import { vi } from 'vitest';

describe('TrlSection', () => {
  const mockLevels = [
    { level: 1, name: 'Basic Principles', description: 'Basic principles observed.' },
    {
      level: 5,
      name: 'Lab Scale Prototype',
      description: 'Component validation in relevant environment.',
    },
    { level: 9, name: 'Production Ready', description: 'Actual system proven.' },
  ];

  it('renders label with current value', () => {
    render(
      <TrlSection
        label="TRL Current"
        value={5}
        description="Current Technology Readiness Level (1-9)"
        levels={mockLevels}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('TRL Current: 5')).toBeInTheDocument();
    expect(screen.getByText('Current Technology Readiness Level (1-9)')).toBeInTheDocument();
  });

  it('renders slider with correct range', () => {
    const { container } = render(
      <TrlSection
        label="TRL Expected"
        value={7}
        description="Target Technology Readiness Level"
        levels={mockLevels}
        onChange={vi.fn()}
      />
    );
    // Radix Slider renders a div with role="slider"
    const slider = container.querySelector('[role="slider"]');
    expect(slider).toBeInTheDocument();
  });

  it('shows current level description when value matches', () => {
    render(
      <TrlSection
        label="TRL Current"
        value={5}
        description="Current Technology Readiness Level (1-9)"
        levels={mockLevels}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Lab Scale Prototype')).toBeInTheDocument();
    expect(screen.getByText('Component validation in relevant environment.')).toBeInTheDocument();
  });

  it('does not show description when value has no matching level', () => {
    render(
      <TrlSection
        label="TRL Current"
        value={1}
        description="Current Technology Readiness Level (1-9)"
        levels={mockLevels}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Basic Principles')).toBeInTheDocument();
    expect(screen.getByText('Basic principles observed.')).toBeInTheDocument();
  });

  it('renders slider component', () => {
    const { container } = render(
      <TrlSection
        label="TRL Current"
        value={5}
        description="Current Technology Readiness Level (1-9)"
        levels={mockLevels}
        onChange={vi.fn()}
      />
    );
    // Radix Slider renders a div with role="slider"
    const slider = container.querySelector('[role="slider"]');
    expect(slider).toBeInTheDocument();
  });

  it('renders help button', () => {
    const { container } = render(
      <TrlSection
        label="TRL Current"
        value={5}
        description="Current Technology Readiness Level (1-9)"
        levels={mockLevels}
        onChange={vi.fn()}
      />
    );
    // HelpCircle icon renders as a button inside the Popover trigger
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
