import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { NodeConfigPanel } from './NodeConfigPanel';
import type { CatalogDeployment, NodeConfig } from '@/lib/node-config';

/**
 * Tests for the per-node config panel (issue #202, playbook task 3.3):
 * env/args/config-file edits are written into `node.data.config` through
 * `onConfigChange`, and catalog `deployment` defaults are shown until a
 * field is overridden.
 */

const deployment: CatalogDeployment = {
  env: [
    { name: 'HOST_INTERFACE', value: 'eth0' },
    { name: 'TARGET_URL', fromEdge: 'target' },
  ],
  args: ['probe', '-i', 'eth0'],
  configFiles: [
    {
      mountPath: '/opt/mmt/probe/mmt-probe.conf',
      content: 'security = {\n  output-channel = "kafka";\n};',
    },
  ],
};

const makeNode = (config?: NodeConfig) => ({
  id: 'n-probe',
  data: { label: 'MMT-PROBE', serviceId: 'svc-probe', ...(config ? { config } : {}) },
});

/** Stateful harness mirroring the canvas' handleConfigChange. */
function Harness({
  deployment: dep,
  initialConfig,
}: {
  deployment?: CatalogDeployment;
  initialConfig?: NodeConfig;
}) {
  const [node, setNode] = useState(makeNode(initialConfig));
  return (
    <NodeConfigPanel
      node={node}
      deployment={dep}
      open
      onOpenChange={() => {}}
      onConfigChange={(nodeId, config) =>
        setNode((n) => {
          const data = { ...n.data };
          if (config === undefined) delete data.config;
          else data.config = config;
          return { ...n, id: nodeId, data };
        })
      }
    />
  );
}

describe('NodeConfigPanel — catalog defaults', () => {
  it('shows catalog env, args and config files as defaults when no override is set', () => {
    render(<Harness deployment={deployment} />);

    // Env rows show the catalog values marked as defaults.
    expect(screen.getByText('HOST_INTERFACE')).toBeInTheDocument();
    expect(screen.getByLabelText('Value for HOST_INTERFACE')).toHaveValue('eth0');
    expect(screen.getByText('TARGET_URL')).toBeInTheDocument();

    // Catalog args render read-only with the default badge.
    expect(screen.getByText('probe')).toBeInTheDocument();
    expect(screen.getByText('eth0')).toBeInTheDocument();

    // The config file editor is prefilled from deployment.configFiles.
    expect(screen.getByText('/opt/mmt/probe/mmt-probe.conf')).toBeInTheDocument();
    expect(screen.getByLabelText('Content of /opt/mmt/probe/mmt-probe.conf')).toHaveValue(
      'security = {\n  output-channel = "kafka";\n};'
    );

    expect(screen.getAllByText('default').length).toBeGreaterThanOrEqual(3);
  });

  it('disables the value input for fromEdge entries resolved at deploy', () => {
    render(<Harness deployment={deployment} />);
    const input = screen.getByLabelText('Value for TARGET_URL');
    expect(input).toBeDisabled();
    expect(screen.getByText(/resolved from the target edge at deploy/)).toBeInTheDocument();
  });

  it('shows empty-state hints when the service has no deployment spec', () => {
    render(<Harness />);
    expect(screen.getByText(/No environment variables/)).toBeInTheDocument();
    expect(screen.getByText(/No arguments/)).toBeInTheDocument();
    expect(screen.getByText(/No config files/)).toBeInTheDocument();
  });
});

describe('NodeConfigPanel — env overrides', () => {
  it('saves an edited catalog value into config.env', () => {
    const onConfigChange = vi.fn();
    render(
      <NodeConfigPanel
        node={makeNode()}
        deployment={deployment}
        open
        onOpenChange={() => {}}
        onConfigChange={onConfigChange}
      />
    );

    fireEvent.change(screen.getByLabelText('Value for HOST_INTERFACE'), {
      target: { value: 'eth1' },
    });

    expect(onConfigChange).toHaveBeenCalledWith('n-probe', {
      env: [{ name: 'HOST_INTERFACE', value: 'eth1' }],
    });
  });

  it('marks an edited row as an override and resets it back to the catalog default', () => {
    render(
      <Harness
        deployment={deployment}
        initialConfig={{ env: [{ name: 'HOST_INTERFACE', value: 'eth1' }] }}
      />
    );

    expect(screen.getByText('override')).toBeInTheDocument();
    expect(screen.getByLabelText('Value for HOST_INTERFACE')).toHaveValue('eth1');

    fireEvent.click(screen.getByTitle('Reset to catalog default'));

    expect(screen.queryByText('override')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Value for HOST_INTERFACE')).toHaveValue('eth0');
  });

  it('adds and removes a node-only variable', () => {
    render(<Harness deployment={deployment} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }));
    expect(screen.getByLabelText('Variable name')).toHaveValue('NEW_VAR');
    expect(screen.getByText('added')).toBeInTheDocument();

    // Rename the new variable — the override is re-keyed, not duplicated.
    fireEvent.change(screen.getByLabelText('Variable name'), { target: { value: 'PROFILE' } });
    expect(screen.getByLabelText('Value for PROFILE')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Remove variable'));
    expect(screen.queryByLabelText('Variable name')).not.toBeInTheDocument();
  });
});

describe('NodeConfigPanel — args overrides', () => {
  it('copies catalog args into an editable override', () => {
    const onConfigChange = vi.fn();
    render(
      <NodeConfigPanel
        node={makeNode()}
        deployment={deployment}
        open
        onOpenChange={() => {}}
        onConfigChange={onConfigChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Override args' }));
    expect(onConfigChange).toHaveBeenCalledWith('n-probe', { args: ['probe', '-i', 'eth0'] });
  });

  it('edits args one per line and resets to the catalog list', () => {
    render(<Harness deployment={deployment} initialConfig={{ args: ['mag', 'synflood'] }} />);

    const textarea = screen.getByLabelText('Arguments');
    expect(textarea).toHaveValue('mag\nsynflood');
    expect(screen.getByText(/catalog default: probe -i eth0/)).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'mag\nudpflood\n--target-ip\n10.0.0.5' } });
    expect(screen.getByLabelText('Arguments')).toHaveValue('mag\nudpflood\n--target-ip\n10.0.0.5');

    fireEvent.click(screen.getByRole('button', { name: 'Reset to catalog args' }));
    expect(screen.queryByLabelText('Arguments')).not.toBeInTheDocument();
    expect(screen.getByText('probe')).toBeInTheDocument();
  });
});

describe('NodeConfigPanel — config file overrides', () => {
  it('saves edited file content into config.configFiles', () => {
    const onConfigChange = vi.fn();
    render(
      <NodeConfigPanel
        node={makeNode()}
        deployment={deployment}
        open
        onOpenChange={() => {}}
        onConfigChange={onConfigChange}
      />
    );

    fireEvent.change(screen.getByLabelText('Content of /opt/mmt/probe/mmt-probe.conf'), {
      target: { value: 'security = { output-channel = "file"; };' },
    });

    expect(onConfigChange).toHaveBeenCalledWith('n-probe', {
      configFiles: [
        {
          mountPath: '/opt/mmt/probe/mmt-probe.conf',
          content: 'security = { output-channel = "file"; };',
        },
      ],
    });
  });

  it('resets an overridden file back to catalog content', () => {
    render(
      <Harness
        deployment={deployment}
        initialConfig={{
          configFiles: [{ mountPath: '/opt/mmt/probe/mmt-probe.conf', content: 'custom = 1;' }],
        }}
      />
    );

    expect(screen.getByLabelText('Content of /opt/mmt/probe/mmt-probe.conf')).toHaveValue(
      'custom = 1;'
    );
    fireEvent.click(screen.getByTitle('Reset to catalog content'));
    expect(screen.getByLabelText('Content of /opt/mmt/probe/mmt-probe.conf')).toHaveValue(
      'security = {\n  output-channel = "kafka";\n};'
    );
  });

  it('adds and removes a node-only config file', () => {
    render(<Harness deployment={deployment} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add config file' }));
    expect(screen.getByLabelText('Config file path')).toHaveValue('/opt/custom.conf');

    fireEvent.click(screen.getByTitle('Remove config file'));
    expect(screen.queryByLabelText('Config file path')).not.toBeInTheDocument();
  });
});

describe('NodeConfigPanel — clearing overrides', () => {
  it('removes data.config entirely when the last override is cleared', () => {
    const onConfigChange = vi.fn();
    render(
      <NodeConfigPanel
        node={makeNode({ env: [{ name: 'X', value: '1' }], args: ['a'] })}
        deployment={deployment}
        open
        onOpenChange={() => {}}
        onConfigChange={onConfigChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear all overrides' }));
    expect(onConfigChange).toHaveBeenCalledWith('n-probe', undefined);
  });

  it('disables Clear all when nothing is overridden', () => {
    render(<Harness deployment={deployment} />);
    expect(screen.getByRole('button', { name: 'Clear all overrides' })).toBeDisabled();
  });
});
