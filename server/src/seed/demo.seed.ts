/**
 * Demo project + scenario seed — task 4.1 of the Montimage
 * attack→detect→respond plan
 * (docs/playbooks/montimage-attack-detect-respond-plan.md).
 *
 * Seeds a ready-to-run demo so a fresh install can execute the scenario
 * end-to-end: a "Montimage Demo" project holding the scenario
 * "HTTP attack → MMT detection → AI4SOAR response" whose topology wires the
 * four catalog modules (issue #186, task 0.1) exactly as the playbook's
 * target runtime topology wiring table prescribes:
 *
 *   MAG       --attacks-->  HTTP-SIM   (attack target → MAG Job args)
 *   MMT-PROBE --monitors--> HTTP-SIM   (probe injected as target-pod sidecar)
 *   MMT-PROBE --notifies--> AI4SOAR    (probe security output → SOAR ingest)
 *   AI4SOAR   --acts-on-->  HTTP-SIM   (namespace-scoped playbook response)
 *
 * Node ids double as the Kubernetes resource names the engine derives
 * (`toResourceName`), so `http-sim` is also the cluster DNS name MAG's args
 * point at. The edge kind is persisted the way the canvas writes it (task
 * 3.2): `data.edgeType` plus the edge `label`; the deploy engine also accepts
 * `data.type`/`type`.
 */

import { Project } from '../models/Project.js';
import { Scenario } from '../models/Scenario.js';
import { Service } from '../models/Service.js';
import { upsertRecord } from './sync-helpers.js';

const DEMO_PROJECT_SHORTNAME = 'MONTIMAGE-DEMO';
const DEMO_SCENARIO_TITLE = 'HTTP attack → MMT detection → AI4SOAR response';

type ScenarioRole = 'attack' | 'target' | 'monitor' | 'reaction';
type DemoNodeId = 'mag' | 'http-sim' | 'mmt-probe' | 'ai4soar';

interface DemoNodeSpec {
  /** Topology node id — also the derived Kubernetes resource name. */
  id: DemoNodeId;
  /** Catalog service `shortName` this node instantiates. */
  serviceShortName: string;
  role: ScenarioRole;
  attachMode?: 'sidecar';
  position: { x: number; y: number };
  /** `node.data.config` overrides validated on save (task 0.4 / 3.3). */
  config?: { args?: string[] };
}

/**
 * The four nodes of the demo topology. Positions lay the flow out
 * left-to-right (attack → target ← monitor / reaction); the renderer re-docks
 * the `sidecar` probe onto its `monitors`-edge host at display time, so the
 * stored position is only a fallback.
 *
 * MAG's `config.args` select the attack profile (the catalog spec carries
 * none — task 3.3 made the profile a per-node override): `http-flood`, an
 * application-layer attack from MAG's catalog (`mag list`), aimed at the
 * target Service's cluster DNS name `http-sim:8080` — the value the
 * `mag → http-sim` attack edge resolves to per the wiring table.
 */
const demoNodes: DemoNodeSpec[] = [
  {
    id: 'mag',
    serviceShortName: 'MAG',
    role: 'attack',
    position: { x: 40, y: 160 },
    config: {
      args: ['mag', 'http-flood', '--target-ip', 'http-sim', '--target-port', '8080'],
    },
  },
  {
    id: 'http-sim',
    serviceShortName: 'HTTP-SIM',
    role: 'target',
    position: { x: 320, y: 160 },
  },
  {
    id: 'mmt-probe',
    serviceShortName: 'MMT-PROBE',
    role: 'monitor',
    attachMode: 'sidecar',
    position: { x: 320, y: 340 },
  },
  {
    id: 'ai4soar',
    serviceShortName: 'AI4SOAR',
    role: 'reaction',
    position: { x: 600, y: 160 },
  },
];

/** The four typed edges of the wiring table (task 3.2 spellings). */
const demoEdges: { id: string; source: DemoNodeId; target: DemoNodeId; edgeType: string }[] = [
  { id: 'edge-mag-attacks-http-sim', source: 'mag', target: 'http-sim', edgeType: 'attacks' },
  {
    id: 'edge-mmt-probe-monitors-http-sim',
    source: 'mmt-probe',
    target: 'http-sim',
    edgeType: 'monitors',
  },
  {
    id: 'edge-mmt-probe-notifies-ai4soar',
    source: 'mmt-probe',
    target: 'ai4soar',
    edgeType: 'notifies',
  },
  {
    id: 'edge-ai4soar-acts-on-http-sim',
    source: 'ai4soar',
    target: 'http-sim',
    edgeType: 'acts-on',
  },
];

/**
 * Render the `topology.yaml` mirror the canvas' `nodesToYaml` produces
 * (`services:` + `connections:`), so the seeded scenario opens with a code
 * view that matches its canvas. Built by hand because `js-yaml` is a
 * client-only dependency — every value here is seed-controlled, never user
 * input.
 */
function topologyYaml(
  nodes: { id: string; name: string; title: string; type: string; serviceId: string }[],
  edges: { id: string; from: string; to: string; type: string }[],
  positions: Map<string, { x: number; y: number }>
): string {
  const serviceLines = nodes.flatMap((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    return [
      `  - id: ${n.id}`,
      `    name: ${n.name}`,
      `    title: ${n.title}`,
      `    type: ${n.type}`,
      `    serviceId: ${n.serviceId}`,
      `    position:`,
      `      x: ${pos.x}`,
      `      y: ${pos.y}`,
    ];
  });
  const connectionLines = edges.flatMap((e) => [
    `  - id: ${e.id}`,
    `    from: ${e.from}`,
    `    to: ${e.to}`,
    `    type: ${e.type}`,
  ]);
  return ['services:', ...serviceLines, 'connections:', ...connectionLines, ''].join('\n');
}

export const seedDemoScenario = async (): Promise<void> => {
  console.info('Seeding demo project and scenario...');

  // Resolve the four catalog modules the demo wires together (task 0.1).
  const serviceByShortName = new Map<string, { _id: unknown; title: string }>();
  const missing: string[] = [];
  for (const spec of demoNodes) {
    const service = await Service.findOne({ shortName: spec.serviceShortName })
      .select('_id title')
      .lean();
    if (!service) {
      missing.push(spec.serviceShortName);
    } else {
      serviceByShortName.set(spec.serviceShortName, {
        _id: service._id,
        title: service.title,
      });
    }
  }
  if (missing.length > 0) {
    console.error(`  Demo scenario skipped — catalog services not seeded: ${missing.join(', ')}`);
    return;
  }

  // The demo project — upserted by shortName so re-running `npm run seed`
  // refreshes it instead of duplicating it.
  const projectAction = await upsertRecord(
    Project,
    { shortName: DEMO_PROJECT_SHORTNAME },
    {
      title: 'Montimage attack → detect → respond demo',
      sector: 'Cross-Sector',
      leader: 'MI',
      involvedPartners: ['MI'],
      description:
        'Ready-to-run demo project holding the "HTTP attack → MMT detection → AI4SOAR response" scenario from docs/playbooks/montimage-attack-detect-respond-plan.md. Assign an Infrastructure to the scenario and execute it to watch MAG attack HTTP-SIM, MMT-Probe detect the traffic, and AI4SOAR apply the Kubernetes response.',
      isComposite: false,
    }
  );
  const project = await Project.findOne({ shortName: DEMO_PROJECT_SHORTNAME }).select('_id').lean();
  if (!project) {
    console.error('  Demo scenario skipped — demo project could not be resolved');
    return;
  }
  if (projectAction === 'created') {
    console.info(`  Created project: ${DEMO_PROJECT_SHORTNAME}`);
  } else if (projectAction === 'updated') {
    console.info(`  Updated project: ${DEMO_PROJECT_SHORTNAME}`);
  } else {
    console.info(`  Project up to date: ${DEMO_PROJECT_SHORTNAME}`);
  }

  // Topology nodes in the shape the canvas persists (React Flow records):
  // `data.type` is the role category name lowercased, and `role`/`attachMode`
  // are persisted from the catalog deployment spec so badges and sidecar
  // docking still resolve if the catalog entry disappears (task 3.1).
  const nodes = demoNodes.map((spec) => {
    const service = serviceByShortName.get(spec.serviceShortName)!;
    return {
      id: spec.id,
      type: 'service',
      position: spec.position,
      data: {
        label: spec.serviceShortName,
        type: spec.role,
        serviceId: String(service._id),
        serviceTitle: service.title,
        uiType: 'web',
        repositoryTable: 'INTACT_TOOLBOX',
        role: spec.role,
        ...(spec.attachMode && { attachMode: spec.attachMode }),
        ...(spec.config && { config: spec.config }),
      },
    };
  });

  const edges = demoEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: true,
    label: e.edgeType,
    data: { edgeType: e.edgeType },
  }));

  const yaml = topologyYaml(
    nodes.map((n) => ({
      id: n.id,
      name: n.data.label,
      title: n.data.serviceTitle,
      type: n.data.type,
      serviceId: n.data.serviceId,
    })),
    demoEdges.map((e) => ({ id: e.id, from: e.source, to: e.target, type: e.edgeType })),
    new Map(demoNodes.map((n) => [n.id, n.position]))
  );

  const action = await upsertRecord(
    Scenario,
    { projectId: project._id, title: DEMO_SCENARIO_TITLE },
    {
      description:
        'Montimage attack → detect → respond demo: MAG (Job) floods HTTP-SIM, the MMT-Probe sidecar in the target pod inspects the traffic and reports to AI4SOAR, which applies a namespace-scoped response (NetworkPolicy, pod deletion, Job scale-down) via its ServiceAccount. Wiring follows the target runtime topology of docs/playbooks/montimage-attack-detect-respond-plan.md.',
      topology: { yaml, nodes, edges },
    }
  );

  if (action === 'created') {
    console.info(`  Created scenario: ${DEMO_SCENARIO_TITLE}`);
  } else if (action === 'updated') {
    console.info(`  Updated scenario: ${DEMO_SCENARIO_TITLE}`);
  } else {
    console.info(`  Scenario up to date: ${DEMO_SCENARIO_TITLE}`);
  }
};
