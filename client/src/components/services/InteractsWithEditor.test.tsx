import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InteractsWithEditor } from './InteractsWithEditor';
import { vi } from 'vitest';

describe('InteractsWithEditor', () => {
  const mockServices = [
    {
      _id: '1',
      shortName: 'MMT',
      title: 'Montimage Monitoring Tool',
      repositoryTable: 'INTACT_TOOLBOX' as const,
    },
    {
      _id: '2',
      shortName: 'SAS',
      title: 'Security Assessment Service',
      repositoryTable: 'INTACT_TOOLBOX' as const,
    },
    {
      _id: '3',
      shortName: 'NIS',
      title: 'NIS2 Compliance',
      repositoryTable: 'OTHER_SERVICES' as const,
    },
  ];

  it('renders with placeholder when no services selected', () => {
    render(
      <InteractsWithEditor
        selected={[]}
        allServices={mockServices}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText('Select services...')).toBeInTheDocument();
  });

  it('displays count when services are selected', () => {
    render(
      <InteractsWithEditor
        selected={['MMT']}
        allServices={mockServices}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText('1 service selected')).toBeInTheDocument();
  });

  it('shows selected badges', () => {
    render(
      <InteractsWithEditor
        selected={['MMT', 'SAS']}
        allServices={mockServices}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText('MMT')).toBeInTheDocument();
    expect(screen.getByText('SAS')).toBeInTheDocument();
  });

  it('filters services by search', async () => {
    render(
      <InteractsWithEditor
        selected={[]}
        allServices={mockServices}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    const searchInput = screen.getByPlaceholderText('Search services...');
    fireEvent.change(searchInput, { target: { value: 'MMT' } });

    await waitFor(() => {
      expect(screen.getByText('MMT')).toBeInTheDocument();
    });

    // SAS and NIS should not appear
    expect(screen.queryByText('SAS')).not.toBeInTheDocument();
    expect(screen.queryByText('NIS2 Compliance')).not.toBeInTheDocument();
  });

  it('calls onAdd when toggling a service', () => {
    const onAdd = vi.fn();
    render(
      <InteractsWithEditor
        selected={[]}
        allServices={mockServices}
        onAdd={onAdd}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    const mmtItem = screen.getByText('MMT').closest('div');
    if (mmtItem) {
      fireEvent.click(mmtItem);
    }

    expect(onAdd).toHaveBeenCalledWith('MMT');
  });

  it('calls onRemove when clicking X on a badge', () => {
    const onRemove = vi.fn();
    const { container } = render(
      <InteractsWithEditor
        selected={['MMT', 'SAS']}
        allServices={mockServices}
        onAdd={vi.fn()}
        onRemove={onRemove}
        onClear={vi.fn()}
      />
    );

    // Find all cursor-pointer SVGs (X close buttons on badges)
    const pointerSvgs = container.querySelectorAll('svg.cursor-pointer');
    // Click the second X button (for SAS, index 1)
    if (pointerSvgs.length > 1) {
      fireEvent.click(pointerSvgs[1]);
    }

    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('calls onClear when clear button is clicked', async () => {
    const onClear = vi.fn();
    render(
      <InteractsWithEditor
        selected={['MMT']}
        allServices={mockServices}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onClear={onClear}
      />
    );

    // Open the popover first
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    const clearBtn = screen.getByText('Clear all');
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalled();
  });

  it('filters by shortName and title', async () => {
    render(
      <InteractsWithEditor
        selected={[]}
        allServices={mockServices}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    const searchInput = screen.getByPlaceholderText('Search services...');
    fireEvent.change(searchInput, { target: { value: 'Security' } });

    await waitFor(() => {
      expect(screen.getByText('SAS')).toBeInTheDocument();
    });

    expect(screen.queryByText('MMT')).not.toBeInTheDocument();
  });

  it('respects editingServiceId exclusion', async () => {
    render(
      <InteractsWithEditor
        selected={[]}
        allServices={mockServices}
        editingServiceId="1"
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    // MMT should not appear since it's the editing service
    expect(screen.queryByText('MMT')).not.toBeInTheDocument();
    expect(screen.getByText('SAS')).toBeInTheDocument();
  });

  it('shows "No services found" when filtered to empty', async () => {
    render(
      <InteractsWithEditor
        selected={[]}
        allServices={mockServices}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    const searchInput = screen.getByPlaceholderText('Search services...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    await waitFor(() => {
      expect(screen.getByText('No services found')).toBeInTheDocument();
    });
  });
});
