import { describe, it, expect } from 'vitest';
import { navigation, navTourId } from '@/components/layout/Sidebar';
import { buildTourSteps } from './tour-steps';

describe('navTourId', () => {
  it('maps the root route to nav-dashboard', () => {
    expect(navTourId('/')).toBe('nav-dashboard');
  });

  it('derives the id from the path', () => {
    expect(navTourId('/services')).toBe('nav-services');
    expect(navTourId('/admin/users/')).toBe('nav-admin-users');
  });
});

describe('buildTourSteps', () => {
  it('derives one menu step per sidebar navigation entry', () => {
    const steps = buildTourSteps(navigation);
    for (const item of navigation) {
      const step = steps.find((s) => s.id === `menu-${navTourId(item.href)}`);
      expect(step, item.name).toBeDefined();
      expect(step?.title).toBe(item.name);
      expect(step?.target).toBe(navTourId(item.href));
    }
  });

  it('gives a new navigation entry generic copy', () => {
    const steps = buildTourSteps([{ name: 'Reports', href: '/reports' }]);
    const step = steps.find((s) => s.target === 'nav-reports');
    expect(step?.description).toBe('Open Reports from the sidebar.');
  });

  it('starts with a centered welcome and ends with a closing step', () => {
    const steps = buildTourSteps(navigation);
    expect(steps[0].id).toBe('welcome');
    expect(steps[0].target).toBeUndefined();
    expect(steps[steps.length - 1].id).toBe('finish');
    expect(steps[steps.length - 1].target).toBeUndefined();
  });

  it('covers the header controls and the core workflow in order', () => {
    const ids = buildTourSteps(navigation).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['help', 'theme-toggle', 'user-menu']));
    const flow = [
      'flow-services',
      'flow-projects',
      'flow-scenarios',
      'flow-infrastructure',
      'flow-execute',
    ];
    const positions = flow.map((id) => ids.indexOf(id));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('uses unique step ids', () => {
    const ids = buildTourSteps(navigation).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
