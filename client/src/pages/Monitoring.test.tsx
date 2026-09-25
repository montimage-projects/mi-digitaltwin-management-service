import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { Monitoring } from './Monitoring';
import { monitoringApi, type AlertRule, type MonitoringSnapshot } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';

vi.mock('@/lib/api', () => ({
  monitoringApi: {
    getMetrics: vi.fn(),
    listRules: vi.fn(),
    createRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const MIB = 1024 * 1024;

const SNAPSHOT: MonitoringSnapshot = {
  collectedAt: '2026-09-24T10:00:00.000Z',
  infrastructures: [
    { infrastructureId: 'i1', name: 'lab-cluster', available: true, namespaces: 1 },
    {
      infrastructureId: 'i2',
      name: 'edge-cluster',
      available: false,
      reason: 'metrics-server is not installed or not available in this cluster',
      namespaces: 1,
    },
  ],
  services: [
    {
      key: 'e1:web',
      name: 'web',
      serviceIds: ['svc-web', 'svc-probe'],
      nodeIds: ['n1', 'n2'],
      scenarioId: 's1',
      scenarioTitle: 'Web scenario',
      executionId: 'e1',
      namespace: 'ns-a',
      infrastructureId: 'i1',
      infrastructureName: 'lab-cluster',
      metricsAvailable: true,
      pods: 2,
      cpuMillicores: 300,
      memoryBytes: 256 * MIB,
      containers: [
        { name: 'web', cpuMillicores: 250, memoryBytes: 224 * MIB },
        { name: 'mmt-probe', cpuMillicores: 50, memoryBytes: 32 * MIB },
      ],
    },
    {
      key: 'e2:db',
      name: 'db',
      serviceIds: ['svc-db'],
      nodeIds: ['n1'],
      scenarioId: 's2',
      scenarioTitle: 'Db scenario',
      executionId: 'e2',
      namespace: 'ns-b',
      infrastructureId: 'i2',
      infrastructureName: 'edge-cluster',
      metricsAvailable: false,
      pods: 0,
      cpuMillicores: 0,
      memoryBytes: 0,
      containers: [],
    },
  ],
  alerts: [
    {
      ruleId: 'r1',
      ruleName: 'High CPU',
      serviceKey: 'e1:web',
      serviceName: 'web',
      executionId: 'e1',
      infrastructureId: 'i1',
      metric: 'cpu_millicores',
      operator: 'gt',
      value: 300,
      threshold: 200,
      severity: 'critical',
    },
  ],
};

const RULE: AlertRule = {
  _id: 'r1',
  name: 'High CPU',
  metric: 'cpu_millicores',
  operator: 'gt',
  threshold: 200,
  severity: 'critical',
  scope: {},
  enabled: true,
  createdAt: '2026-09-24T09:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Monitoring />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  };
}

function loginAs(role: string) {
  useAuthStore.setState({
    user: { id: 'u1', username: `${role}-user`, role },
    token: 'test-token',
    isAuthenticated: true,
  });
}

describe('Monitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(monitoringApi.getMetrics).mockResolvedValue(SNAPSHOT);
    vi.mocked(monitoringApi.listRules).mockResolvedValue([RULE]);
    loginAs('admin');
  });

  it('lists running services with their CPU, memory and container breakdown', async () => {
    renderPage();

    const row = (await screen.findByText('Web scenario')).closest('tr')!;
    expect(within(row).getByText('web')).toBeInTheDocument();
    expect(within(row).getByText('300m')).toBeInTheDocument();
    expect(within(row).getByText('256.0 MiB')).toBeInTheDocument();
    expect(within(row).getByText(/mmt-probe: 50m \/ 32\.0 MiB/)).toBeInTheDocument();
    expect(within(row).getByRole('img', { name: 'web CPU, latest 300m' })).toBeInTheDocument();

    const dbRow = screen.getByText('Db scenario').closest('tr')!;
    expect(within(dbRow).getByText('No metrics')).toBeInTheDocument();
  });

  it('states that request rate, error rate and latency are not available yet', async () => {
    renderPage();
    expect(
      await screen.findByText(/Request rate, error rate and latency are not yet available/)
    ).toBeInTheDocument();
  });

  it('shows a banner for an infrastructure without metrics', async () => {
    renderPage();
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('edge-cluster: metrics unavailable');
    expect(banner).toHaveTextContent('metrics-server is not installed');
  });

  it('lists fired alerts with their severity', async () => {
    renderPage();
    const alerts = await screen.findByRole('list', { name: 'Active alerts' });
    expect(within(alerts).getByText('critical')).toBeInTheDocument();
    expect(within(alerts).getByText('High CPU')).toBeInTheDocument();
    expect(within(alerts).getByText(/web: CPU \(millicores\) 300m > 200/)).toBeInTheDocument();
  });

  it('shows an error state when the snapshot cannot be loaded', async () => {
    vi.mocked(monitoringApi.getMetrics).mockRejectedValue(new Error('Network down'));
    renderPage();
    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });

  it('keeps the last snapshot on screen when a background refresh fails', async () => {
    vi.mocked(monitoringApi.getMetrics)
      .mockResolvedValueOnce(SNAPSHOT)
      .mockRejectedValue(new Error('Network down'));
    const { queryClient } = renderPage();
    await screen.findByText('Web scenario');

    await queryClient.refetchQueries({ queryKey: ['monitoring-metrics'] });

    const banner = await screen.findByText(/Last refresh failed \(Network down\)/);
    expect(
      within(banner.closest('[role="alert"]')!).getByRole('button', { name: 'Retry' })
    ).toBeInTheDocument();
    expect(screen.getByText('Web scenario')).toBeInTheDocument();
  });

  it('shows an error state when the alert rules cannot be loaded', async () => {
    vi.mocked(monitoringApi.listRules).mockRejectedValue(new Error('Rules unavailable'));
    renderPage();
    expect(await screen.findByText('Rules unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No alert rules defined')).not.toBeInTheDocument();
  });

  it('explains that sparkline history is session-only', async () => {
    renderPage();
    expect(
      await screen.findByText(/history is collected in this tab since the page was opened/)
    ).toBeInTheDocument();
  });

  it('flags a negative threshold inline and blocks saving', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /New rule/ }));
    await user.type(screen.getByLabelText('Name'), 'CPU');
    const threshold = screen.getByLabelText('Threshold');
    expect(threshold).toBeRequired();
    fireEvent.change(threshold, { target: { value: '-5' } });

    const message = screen.getByText('Threshold must be 0 or greater');
    expect(threshold).toHaveAttribute('aria-invalid', 'true');
    expect(threshold).toHaveAttribute('aria-describedby', message.id);
    expect(screen.getByRole('button', { name: 'Create rule' })).toBeDisabled();
  });

  it('lets an admin create an alert rule', async () => {
    const user = userEvent.setup();
    vi.mocked(monitoringApi.createRule).mockResolvedValue(RULE);
    renderPage();

    await user.click(await screen.findByRole('button', { name: /New rule/ }));
    await user.type(screen.getByLabelText('Name'), 'Memory pressure');
    await user.type(screen.getByLabelText('Threshold'), '512');
    await user.click(screen.getByRole('button', { name: 'Create rule' }));

    await waitFor(() =>
      expect(monitoringApi.createRule).toHaveBeenCalledWith({
        name: 'Memory pressure',
        metric: 'cpu_millicores',
        operator: 'gt',
        threshold: 512,
        severity: 'warning',
        scope: { serviceId: undefined },
        enabled: true,
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Alert rule created');
  });

  it('explains a 403 when the server refuses a rule change', async () => {
    const user = userEvent.setup();
    vi.mocked(monitoringApi.createRule).mockRejectedValue(
      Object.assign(new Error('Request failed with status code 403'), {
        response: { status: 403 },
      })
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: /New rule/ }));
    await user.type(screen.getByLabelText('Name'), 'CPU');
    await user.type(screen.getByLabelText('Threshold'), '1');
    await user.click(screen.getByRole('button', { name: 'Create rule' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to save alert rule: Only administrators can manage alert rules'
      )
    );
  });

  it('shows rules read-only to non-admins', async () => {
    loginAs('viewer');
    renderPage();

    expect(await screen.findByText(/Read-only: only administrators/)).toBeInTheDocument();
    expect(await screen.findByText('CPU (millicores) > 200')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New rule/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit High CPU' })).not.toBeInTheDocument();
  });

  it('shows edit and delete controls to admins', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Edit High CPU' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete High CPU' })).toBeInTheDocument();
  });
});
