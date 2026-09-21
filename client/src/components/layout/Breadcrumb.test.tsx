import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Breadcrumb } from './Breadcrumb';

function Wrapper({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  return <MemoryRouter initialEntries={[pathname]}>{children}</MemoryRouter>;
}

describe('Breadcrumb', () => {
  it('renders nothing on the root dashboard path', () => {
    render(
      <Wrapper pathname="/">
        <Breadcrumb />
      </Wrapper>
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('renders nothing for single-segment list pages (no trail to show)', () => {
    render(
      <Wrapper pathname="/projects">
        <Breadcrumb />
      </Wrapper>
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('renders nothing for single-segment list pages - services', () => {
    render(
      <Wrapper pathname="/services">
        <Breadcrumb />
      </Wrapper>
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('renders nothing for single-segment list pages - infrastructure', () => {
    render(
      <Wrapper pathname="/infrastructure">
        <Breadcrumb />
      </Wrapper>
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('renders nothing for single-segment list pages - settings', () => {
    render(
      <Wrapper pathname="/settings">
        <Breadcrumb />
      </Wrapper>
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('renders nothing for single-segment list pages - analytics', () => {
    render(
      <Wrapper pathname="/analytics">
        <Breadcrumb />
      </Wrapper>
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('renders a breadcrumb trail for /projects/add', () => {
    render(
      <Wrapper pathname="/projects/add">
        <Breadcrumb />
      </Wrapper>
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Add Project')).toBeInTheDocument();
  });

  it('renders a breadcrumb trail for /projects/:id', () => {
    render(
      <Wrapper pathname="/projects/abc123">
        <Breadcrumb />
      </Wrapper>
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    // Dynamic segment should show the id
    expect(screen.getByText('abc123')).toBeInTheDocument();
  });

  it('renders a breadcrumb trail for /projects/:id/edit', () => {
    render(
      <Wrapper pathname="/projects/abc123/edit">
        <Breadcrumb />
      </Wrapper>
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('abc123/edit')).toBeInTheDocument();
  });

  it('renders a breadcrumb trail for /scenarios/:id', () => {
    render(
      <Wrapper pathname="/scenarios/xyz789">
        <Breadcrumb />
      </Wrapper>
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    expect(screen.getByText('Scenarios')).toBeInTheDocument();
    expect(screen.getByText('xyz789')).toBeInTheDocument();
  });

  it('renders a breadcrumb trail for /scenarios/:id/edit', () => {
    render(
      <Wrapper pathname="/scenarios/xyz789/edit">
        <Breadcrumb />
      </Wrapper>
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    expect(screen.getByText('Scenarios')).toBeInTheDocument();
    // Shows the full dynamic segment
    expect(screen.getByText('xyz789/edit')).toBeInTheDocument();
  });

  it('renders nothing for unknown routes', () => {
    render(
      <Wrapper pathname="/unknown/deep/path">
        <Breadcrumb />
      </Wrapper>
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('renders custom labels when provided', () => {
    render(
      <Wrapper pathname="/custom/path">
        <Breadcrumb
          labels={{
            '/custom': 'Custom',
            '/custom/path': 'Path',
          }}
        />
      </Wrapper>
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByText('Path')).toBeInTheDocument();
  });

  it('renders links that are clickable for non-current segments', () => {
    render(
      <Wrapper pathname="/projects/add">
        <Breadcrumb />
      </Wrapper>
    );
    const projectsLink = screen.getByText('Projects');
    expect(projectsLink).toHaveAttribute('href', '/projects');
    // Current segment should not be a link
    const currentSegment = screen.getByText('Add Project');
    expect(currentSegment).not.toHaveAttribute('href');
  });

  it('uses aria-current="page" on the current segment', () => {
    render(
      <Wrapper pathname="/projects/abc123">
        <Breadcrumb />
      </Wrapper>
    );
    const current = screen.getByText('abc123');
    expect(current).toHaveAttribute('aria-current', 'page');
  });
});
