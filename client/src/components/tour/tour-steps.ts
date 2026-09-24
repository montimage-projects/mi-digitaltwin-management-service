import { navTourId, type NavItem } from '@/components/layout/Sidebar';

export type TourSide = 'top' | 'right' | 'bottom' | 'left';

export interface TourStep {
  id: string;
  title: string;
  description: string;
  /**
   * `data-tour` value of the element this step points at. Steps without a
   * target — or whose target is not visible (e.g. the desktop sidebar on a
   * small screen) — are shown as a centered dialog instead.
   */
  target?: string;
  /** Preferred side of the target to place the step on. */
  side?: TourSide;
}

/** Tour copy per sidebar entry, keyed by href. Unknown entries get generic copy. */
const NAV_TOUR_COPY: Record<string, string> = {
  '/': 'Your home base: platform totals, recent projects and a Getting Started checklist.',
  '/services':
    'The Service Repository — browse the cybersecurity tools of the Security Toolbox and review how each one is configured.',
  '/projects':
    'Digital twin projects group the scenarios you build for a sector such as Telecom or Healthcare.',
  '/infrastructure':
    'Connect and manage the Kubernetes clusters or Docker environments that scenarios are deployed to.',
  '/analytics':
    'Platform usage at a glance: projects by sector, services by category and infrastructure status.',
  '/settings': 'System information, service categories and other platform preferences.',
};

function navStep(item: Pick<NavItem, 'name' | 'href'>): TourStep {
  return {
    id: `menu-${navTourId(item.href)}`,
    title: item.name,
    description: NAV_TOUR_COPY[item.href] ?? `Open ${item.name} from the sidebar.`,
    target: navTourId(item.href),
    side: 'right',
  };
}

/**
 * Builds the guided tour: the header and sidebar menus (one step per
 * navigation entry), then the core workflow from browsing services to
 * executing a scenario.
 */
export function buildTourSteps(
  navigation: ReadonlyArray<Pick<NavItem, 'name' | 'href'>>
): TourStep[] {
  return [
    {
      id: 'welcome',
      title: 'Welcome to the platform',
      description:
        'This short tour walks you through the main menus and the typical workflow for building and running a digital twin. Use Next and Back to move between steps, or skip the tour at any time.',
    },
    {
      id: 'help',
      title: 'Reopen the tour anytime',
      description: 'This help button starts the guided tour again whenever you need a refresher.',
      target: 'help',
      side: 'bottom',
    },
    ...navigation.map(navStep),
    {
      id: 'sidebar-toggle',
      title: 'Collapse the sidebar',
      description: 'Shrink the sidebar to icons to give the workspace more room.',
      target: 'sidebar-toggle',
      side: 'right',
    },
    {
      id: 'theme-toggle',
      title: 'Light or dark theme',
      description: 'Switch between the light and dark colour themes.',
      target: 'theme-toggle',
      side: 'bottom',
    },
    {
      id: 'user-menu',
      title: 'Your account',
      description: 'See your role and sign out from the account menu.',
      target: 'user-menu',
      side: 'bottom',
    },
    {
      id: 'main-content',
      title: 'Your workspace',
      description: 'The page you open from the sidebar is shown here.',
      target: 'main-content',
      side: 'top',
    },
    {
      id: 'getting-started',
      title: 'The core workflow',
      description:
        'The Getting Started checklist on the Dashboard summarises the typical workflow. The next steps walk through it.',
      target: 'getting-started',
      side: 'top',
    },
    {
      id: 'flow-services',
      title: '1. Browse the Service Repository',
      description:
        'Start in Services to explore the available cybersecurity tools and check that the ones you need are fully configured.',
      target: navTourId('/services'),
      side: 'right',
    },
    {
      id: 'flow-projects',
      title: '2. Create a Digital Twin Project',
      description: 'In Projects, create a project for your sector (Telecom, Healthcare, etc.).',
      target: navTourId('/projects'),
      side: 'right',
    },
    {
      id: 'flow-scenarios',
      title: '3. Design Scenarios',
      description:
        'Open a project and add scenarios. Build each topology by combining services in the visual editor or in YAML.',
    },
    {
      id: 'flow-infrastructure',
      title: '4. Configure Infrastructure',
      description:
        'In Infrastructure, connect the Kubernetes cluster or Docker environment your scenarios will run on.',
      target: navTourId('/infrastructure'),
      side: 'right',
    },
    {
      id: 'flow-execute',
      title: '5. Execute & Document',
      description:
        'From a scenario, deploy it to your infrastructure, follow the execution, capture your conclusions and export a report.',
    },
    {
      id: 'finish',
      title: "You're all set",
      description:
        'That covers the main menus and the core workflow. Reopen this tour anytime with the help button in the header.',
    },
  ];
}
