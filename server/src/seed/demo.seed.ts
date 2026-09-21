/**
 * Demo project + scenario seed — tasks 4.1 and 5.6 of the Montimage
 * attack→detect→respond plan
 * (docs/playbooks/montimage-attack-detect-respond-plan.md).
 *
 * Seeds a ready-to-run demo so a fresh install can execute the R1 two-attack
 * flow end-to-end: a "Montimage Demo" project holding the scenario
 * "CI attack → MMT detection → AI4SOAR block" whose topology wires the
 * four catalog modules (issue #186, task 0.1; CI-SIM from issue #231)
 * exactly as the playbook's revised runtime topology wiring table
 * prescribes:
 *
 *   MAG       --attacks-->  CI-SIM     (attack target → exec-driven attack)
 *   MMT-PROBE --monitors--> CI-SIM     (probe injected as target-pod sidecar)
 *   MMT-PROBE --notifies--> AI4SOAR    (probe security output → SOAR ingest)
 *   AI4SOAR   --acts-on-->  CI-SIM     (playbook POSTs /admin/block — #235)
 *
 * Node ids double as the Kubernetes resource names the engine derives
 * (`toResourceName`), so `ci-sim` is also the cluster DNS name MAG attacks
 * point at and the AI4SOAR playbook POSTs to
 * (`http://ci-sim:8080/admin/block`). The edge kind is persisted the way the
 * canvas writes it (task 3.2): `data.edgeType` plus the edge `label`; the
 * deploy engine also accepts `data.type`/`type`.
 */

import { Project } from '../models/Project.js';
import { Scenario, type INodeConfig } from '../models/Scenario.js';
import { Service } from '../models/Service.js';
import { upsertRecord } from './sync-helpers.js';

const DEMO_PROJECT_SHORTNAME = 'MONTIMAGE-DEMO';
const DEMO_SCENARIO_TITLE = 'CI attack → MMT detection → AI4SOAR block';
// The P4 title the demo shipped under before the R1 re-seed (issue #236):
// re-running `npm run seed` on an existing install renames the seed-managed
// record in place instead of leaving a stale duplicate next to the R1
// scenario.
const LEGACY_SCENARIO_TITLE = 'HTTP attack → MMT detection → AI4SOAR response';

type ScenarioRole = 'attack' | 'target' | 'monitor' | 'reaction';
type DemoNodeId = 'mag' | 'ci-sim' | 'mmt-probe' | 'ai4soar';

interface DemoNodeSpec {
  /** Topology node id — also the derived Kubernetes resource name. */
  id: DemoNodeId;
  /** Catalog service `shortName` this node instantiates. */
  serviceShortName: string;
  role: ScenarioRole;
  attachMode?: 'sidecar';
  position: { x: number; y: number };
  /** `node.data.config` payload — preserved verbatim on save (task 0.4). */
  config?: INodeConfig;
}

/**
 * The four nodes of the demo topology. Positions lay the flow out
 * left-to-right (attack → target ← monitor / reaction); the renderer re-docks
 * the `sidecar` probe onto its `monitors`-edge host at display time, so the
 * stored position is only a fallback.
 *
 * MAG is a long-running `Deployment` with an idle shell (issue #233) — each
 * attack is launched ad hoc via `kubectl exec -it deploy/mag -n <exec-ns> --
 * sh -c 'mag <attack> --target-ip ci-sim --target-port 8080 2>&1 | tee
 * /proc/1/fd/1'`, which keeps repeated runs possible without redeploying and
 * lands the attack output in the MAG pod's container log (exec output alone
 * only reaches the exec channel). Its `config.profiles` carries the R1
 * two-attack script's default profiles as runbook data (issue #236):
 * scenario validation preserves the key untouched and the deploy merge only
 * reads `config.args`/`config.env`, so the profiles never alter the pod
 * spec. Attack #1's sustained `http-flood` pushes CI-SIM over its rate
 * threshold (`CI_SIM_RATE_LIMIT`/`CI_SIM_RATE_WINDOW_S`, default 50 req/10
 * s) so the target logs "service stopped" and exits before the Deployment
 * restarts it; attack #2 re-runs the same profile after AI4SOAR's
 * `/admin/block`, so CI-SIM answers 403 while the probe still alerts. The
 * `mag → ci-sim` attack edge resolves the target Service's cluster DNS name
 * per the wiring table.
 */
const demoNodes: DemoNodeSpec[] = [
  {
    id: 'mag',
    serviceShortName: 'MAG',
    role: 'attack',
    position: { x: 40, y: 160 },
    config: {
      profiles: [
        {
          name: 'attack-1-stop-the-server',
          description:
            'Attack #1 — sustained `mag http-flood` at ci-sim:8080 pushes the target over its rate threshold; CI-SIM logs "service stopped" and exits, then the Deployment restarts it.',
          args: ['mag', 'http-flood', '--target-ip', 'ci-sim', '--target-port', '8080'],
        },
        {
          name: 'attack-2-already-blocked',
          description:
            'Attack #2 — the same profile re-run after AI4SOAR POSTs the MAG pod address to ci-sim:8080/admin/block; CI-SIM answers 403 while the MMT-Probe sidecar still raises the alert.',
          args: ['mag', 'http-flood', '--target-ip', 'ci-sim', '--target-port', '8080'],
        },
      ],
    },
  },
  {
    id: 'ci-sim',
    serviceShortName: 'CI-SIM',
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
  { id: 'edge-mag-attacks-ci-sim', source: 'mag', target: 'ci-sim', edgeType: 'attacks' },
  {
    id: 'edge-mmt-probe-monitors-ci-sim',
    source: 'mmt-probe',
    target: 'ci-sim',
    edgeType: 'monitors',
  },
  {
    id: 'edge-mmt-probe-notifies-ai4soar',
    source: 'mmt-probe',
    target: 'ai4soar',
    edgeType: 'notifies',
  },
  {
    id: 'edge-ai4soar-acts-on-ci-sim',
    source: 'ai4soar',
    target: 'ci-sim',
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
  // `uiType` rides along so node badges/exec hints mirror the catalog entry
  // (MAG is `terminal` since issue #233) instead of a hardcoded 'web'.
  const serviceByShortName = new Map<
    string,
    { _id: unknown; title: string; uiType?: 'web' | 'terminal' | 'both' }
  >();
  const missing: string[] = [];
  for (const spec of demoNodes) {
    const service = await Service.findOne({ shortName: spec.serviceShortName })
      .select('_id title uiType')
      .lean();
    if (!service) {
      missing.push(spec.serviceShortName);
    } else {
      serviceByShortName.set(spec.serviceShortName, {
        _id: service._id,
        title: service.title,
        uiType: service.uiType,
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
        'Ready-to-run demo project holding the "CI attack → MMT detection → AI4SOAR block" scenario from docs/playbooks/montimage-attack-detect-respond-plan.md. Assign an Infrastructure to the scenario and execute it: MAG deploys as an interactive terminal workload — run the seeded attack profiles with `kubectl exec -it deploy/mag -n <exec-ns> -- sh -c \'mag http-flood --target-ip ci-sim --target-port 8080 2>&1 | tee /proc/1/fd/1\'` — while MMT-Probe raises alerts the console surfaces and AI4SOAR blocks the reported attacker through CI-SIM /admin/block.',
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
        uiType: service.uiType ?? 'web',
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

  // Retitle the seed-managed P4 record in place (issue #236): the upsert
  // below keys on the R1 title, so without the rename an existing install
  // would keep a stale "HTTP attack → …" scenario next to the re-seeded one.
  // Records an operator created by hand (`seedManaged: false`) are never
  // touched — the same guard `deprecateStale` applies.
  const retitled = await Scenario.updateMany(
    { projectId: project._id, title: LEGACY_SCENARIO_TITLE, seedManaged: { $ne: false } },
    { $set: { title: DEMO_SCENARIO_TITLE } }
  );
  if (retitled.modifiedCount > 0) {
    console.info(`  Retitled scenario: ${LEGACY_SCENARIO_TITLE} → ${DEMO_SCENARIO_TITLE}`);
  }

  const action = await upsertRecord(
    Scenario,
    { projectId: project._id, title: DEMO_SCENARIO_TITLE },
    {
      description:
        "Montimage attack → detect → respond demo (R1): MAG deploys as a long-running terminal Deployment carrying the two default attack profiles in its node `config.profiles` — drive them with `kubectl exec -it deploy/mag -n <exec-ns> -- sh -c 'mag http-flood --target-ip ci-sim --target-port 8080 2>&1 | tee /proc/1/fd/1'` (the tee lands the output in the MAG container log the SSE stream ships). Attack #1 stops the CI-SIM server (rate over its threshold → 'service stopped' → restart); attack #2 re-runs after AI4SOAR's playbook POSTs the reported `ip.src` to ci-sim:8080/admin/block, so it is answered 403 while the MMT-Probe sidecar still reports JSON alerts (Kafka, stdout, file). Wiring follows the revised runtime topology of docs/playbooks/montimage-attack-detect-respond-plan.md.",
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
