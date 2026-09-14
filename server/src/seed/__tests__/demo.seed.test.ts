import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { Service } from '../../models/Service.js';
import { Project } from '../../models/Project.js';
import { Scenario } from '../../models/Scenario.js';
import { seedSectors } from '../sectors.seed.js';
import { seedCategories } from '../categories.seed.js';
import { seedServices } from '../services.seed.js';
import { seedPartners } from '../partners.seed.js';
import { seedDemoScenario } from '../demo.seed.js';
import { resolveTopologyNodes, type ServiceImageSource } from '../../services/kubernetesDeploy.js';

/**
 * Integration tests for the demo project + scenario seed (issue #204,
 * playbook task 4.1).
 *
 * Same harness as `seed.integration.test.ts`: a dedicated disposable MongoDB
 * database, dropped in `afterAll`; the whole suite skips when no MongoDB is
 * reachable at `mongodb://127.0.0.1:27017` (or `SEED_TEST_MONGODB_URI`).
 */

const TEST_DB_NAME = `secsim_demo_seed_test_${Date.now()}`;
const TEST_MONGODB_URI = `${process.env.SEED_TEST_MONGODB_URI ?? process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017'}/${TEST_DB_NAME}`;

const DEMO_PROJECT_SHORTNAME = 'MONTIMAGE-DEMO';
const DEMO_SCENARIO_TITLE = 'HTTP attack → MMT detection → AI4SOAR response';

let mongoAvailable = true;

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch {
    mongoAvailable = false;
    return;
  }

  // The demo seed depends on the catalog modules (task 0.1) and the role
  // categories (task 0.2) — seed the same chain `index.ts` runs.
  await seedSectors();
  await seedCategories();
  await seedServices();
  await seedPartners();
});

afterAll(async () => {
  if (!mongoAvailable) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('demo scenario seed (issue #204)', () => {
  test('creates the demo project and scenario with the four wired nodes', async () => {
    if (!mongoAvailable) {
      console.warn('Skipping: no MongoDB reachable at', TEST_MONGODB_URI);
      return;
    }

    await seedDemoScenario();

    const project = await Project.findOne({ shortName: DEMO_PROJECT_SHORTNAME });
    expect(project, 'demo project seeded').not.toBeNull();
    expect(project?.leader).toBe('MI');
    expect(project?.involvedPartners).toContain('MI');

    const scenario = await Scenario.findOne({
      projectId: project?._id,
      title: DEMO_SCENARIO_TITLE,
    });
    expect(scenario, 'demo scenario seeded').not.toBeNull();

    const nodes = scenario?.topology.nodes ?? [];
    const edges = scenario?.topology.edges ?? [];
    expect(nodes, 'four topology nodes').toHaveLength(4);
    expect(edges, 'four typed edges').toHaveLength(4);

    // Each node references its catalog service by id and carries the role the
    // badge/edge-validation layer resolves.
    const serviceByNode = new Map([
      ['mag', 'MAG'],
      ['http-sim', 'HTTP-SIM'],
      ['mmt-probe', 'MMT-PROBE'],
      ['ai4soar', 'AI4SOAR'],
    ] as const);
    for (const [nodeId, shortName] of serviceByNode) {
      const node = nodes.find((n) => n.id === nodeId);
      expect(node, `node ${nodeId}`).toBeDefined();
      const service = await Service.findOne({ shortName }).select('_id').lean();
      expect(service, `service ${shortName} seeded`).not.toBeNull();
      expect(String(node?.data?.serviceId)).toBe(String(service?._id));
    }

    // The wiring table of the target runtime topology, persisted the way the
    // canvas writes typed edges (task 3.2): `data.edgeType` + label.
    const edgeTriples = edges.map((e) => [
      e.source,
      (e.data as { edgeType?: string } | undefined)?.edgeType,
      e.target,
    ]);
    expect(edgeTriples).toEqual(
      expect.arrayContaining([
        ['mag', 'attacks', 'http-sim'],
        ['mmt-probe', 'monitors', 'http-sim'],
        ['mmt-probe', 'notifies', 'ai4soar'],
        ['ai4soar', 'acts-on', 'http-sim'],
      ])
    );

    // The monitor node is the sidecar the engine injects into the target pod.
    const probe = nodes.find((n) => n.id === 'mmt-probe');
    expect(probe?.data?.attachMode).toBe('sidecar');

    // MAG carries no fixed attack args (issue #233) — it is a terminal
    // Deployment driven via `kubectl exec`; `uiType` mirrors the catalog.
    const mag = nodes.find((n) => n.id === 'mag');
    expect(mag?.data?.uiType).toBe('terminal');
    expect(mag?.data?.config).toBeUndefined();

    // The YAML mirror lists the same services and typed connections.
    expect(scenario?.topology.yaml).toContain('http-sim');
    expect(scenario?.topology.yaml).toContain('type: attacks');
    expect(scenario?.topology.yaml).toContain('type: acts-on');
  });

  test('the seeded topology resolves into deployable nodes', async () => {
    if (!mongoAvailable) return;

    const scenario = await Scenario.findOne({ title: DEMO_SCENARIO_TITLE });
    expect(scenario).not.toBeNull();

    const services = await Service.find({
      shortName: { $in: ['MAG', 'HTTP-SIM', 'MMT-PROBE', 'AI4SOAR'] },
    }).lean();
    const resolved = resolveTopologyNodes(
      scenario!.topology.nodes,
      services as unknown as ServiceImageSource[],
      scenario!.topology.edges
    );

    expect(resolved).toHaveLength(4);
    const byId = new Map(resolved.map((n) => [n.nodeId, n]));
    // Issue #233: MAG resolves to a long-running terminal Deployment whose
    // container idles on the seeded shell command — attacks come via exec.
    expect(byId.get('mag')?.deployment.kind).toBe('Deployment');
    expect(byId.get('mag')?.uiType).toBe('terminal');
    expect(byId.get('mag')?.deployment.command).toEqual([
      'sh',
      '-c',
      'while true; do sleep 3600; done',
    ]);
    // No fixed attack args — Mongoose defaults the array field to [].
    expect(byId.get('mag')?.deployment.args ?? []).toEqual([]);
    expect(byId.get('mmt-probe')?.edgeContext.monitors).toEqual(['http-sim']);
    expect(byId.get('mmt-probe')?.edgeContext.notifies).toEqual(['ai4soar']);
    expect(byId.get('ai4soar')?.edgeContext.actsOn).toEqual(['http-sim']);
    expect(byId.get('mag')?.edgeContext.targets).toEqual(['http-sim']);
    // Every node resolves to its seeded docker image.
    for (const n of resolved) {
      expect(n.image, `${n.nodeId} image`).toMatch(/^registry\.montimage\.eu\//);
    }
  });

  test('is idempotent — re-running does not duplicate the project or scenario', async () => {
    if (!mongoAvailable) return;

    await seedDemoScenario();

    expect(await Project.countDocuments({ shortName: DEMO_PROJECT_SHORTNAME })).toBe(1);
    expect(await Scenario.countDocuments({ title: DEMO_SCENARIO_TITLE })).toBe(1);
  });

  test('skips cleanly when a catalog module is missing', async () => {
    if (!mongoAvailable) return;

    // Removing a module must not fail the seed — it logs and skips so the
    // rest of `npm run seed` still completes (same convention as
    // `seedServices` on a missing category).
    await Service.deleteOne({ shortName: 'AI4SOAR' });
    await Scenario.deleteOne({ title: DEMO_SCENARIO_TITLE });

    await seedDemoScenario();

    expect(await Scenario.findOne({ title: DEMO_SCENARIO_TITLE })).toBeNull();

    // Restore for any suite that runs after this file's database is reused.
    await seedServices();
    await seedDemoScenario();
    expect(await Scenario.findOne({ title: DEMO_SCENARIO_TITLE })).not.toBeNull();
  });
});
