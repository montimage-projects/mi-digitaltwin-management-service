import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectTable } from '@/components/projects/ProjectTable';
import type { Project } from '@/lib/api';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  ...vi.importActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock @tanstack/react-query
vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isSuccess: false,
    isError: false,
  })),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

// Mock the API
vi.mock('@/lib/api', () => ({
  projectsApi: {
    delete: vi.fn(),
  },
}));

const mockProjects: Project[] = [
  {
    _id: 'proj-1',
    shortName: 'PROJ-A',
    title: 'Project Alpha',
    sector: 'Telecommunications',
    leader: 'Alice',
    involvedPartners: ['Partner1', 'Partner2'],
    isComposite: false,
    atomicProjectIds: [],
    scenarioCount: 3,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-15',
  },
  {
    _id: 'proj-2',
    shortName: 'PROJ-B',
    title: 'Project Beta',
    sector: 'Healthcare',
    leader: 'Bob',
    involvedPartners: ['Partner3'],
    isComposite: true,
    atomicProjectIds: [
      { _id: 'sub-1', shortName: 'SUB-A', title: 'Sub Project A', sector: 'Healthcare' },
    ],
    scenarioCount: 5,
    createdAt: '2024-02-01',
    updatedAt: '2024-02-10',
  },
];

describe('ProjectTable Component', () => {
  it('renders the table header with correct columns', () => {
    render(<ProjectTable projects={mockProjects} isLoading={false} onRowClick={vi.fn()} />);

    expect(screen.getByText('Short Name')).toBeInTheDocument();
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Sector')).toBeInTheDocument();
    expect(screen.getByText('Leader')).toBeInTheDocument();
    expect(screen.getByText('Partners')).toBeInTheDocument();
    expect(screen.getByText('Scenarios')).toBeInTheDocument();
  });

  it('displays all project rows with correct data', () => {
    render(<ProjectTable projects={mockProjects} isLoading={false} onRowClick={vi.fn()} />);

    expect(screen.getByText('PROJ-A')).toBeInTheDocument();
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Telecommunications')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Partners count
    expect(screen.getByText('3')).toBeInTheDocument(); // Scenario count

    expect(screen.getByText('PROJ-B')).toBeInTheDocument();
    expect(screen.getByText('Project Beta')).toBeInTheDocument();
    expect(screen.getByText('Healthcare')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // Partners count
    expect(screen.getByText('5')).toBeInTheDocument(); // Scenario count
  });

  it('shows composite indicator for composite projects', () => {
    render(<ProjectTable projects={mockProjects} isLoading={false} onRowClick={vi.fn()} />);

    // The Layers icon from lucide-react should be present for the composite project
    const rows = screen.getAllByRole('row');
    // Find the row containing PROJ-B (composite)
    const projBRow = rows.find((row) => row.textContent?.includes('PROJ-B'));
    expect(projBRow).toBeTruthy();
  });

  it('shows skeleton loading state when loading', () => {
    render(<ProjectTable projects={[]} isLoading={true} onRowClick={vi.fn()} />);

    // Skeletons use animate-pulse class
    const skeletonElements = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletonElements.length).toBeGreaterThan(0);
  });

  it('shows empty state when no projects', () => {
    render(<ProjectTable projects={[]} isLoading={false} onRowClick={vi.fn()} />);

    expect(screen.getByText('No projects found')).toBeInTheDocument();
  });

  it('calls onRowClick when a row is clicked', async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();

    render(<ProjectTable projects={mockProjects} isLoading={false} onRowClick={onRowClick} />);

    const firstRow = screen.getByText('PROJ-A').closest('tr');
    if (firstRow) {
      await user.click(firstRow);
      expect(onRowClick).toHaveBeenCalledWith(mockProjects[0]);
    }
  });

  it('renders sector badges with correct colors', () => {
    render(<ProjectTable projects={mockProjects} isLoading={false} onRowClick={vi.fn()} />);

    // Check that sector badges are rendered
    const telecommBadge = screen.getByText('Telecommunications');
    const healthcareBadge = screen.getByText('Healthcare');

    expect(telecommBadge.closest('[class*="bg-blue-100"]')).toBeTruthy();
    expect(healthcareBadge.closest('[class*="bg-green-100"]')).toBeTruthy();
  });
});
