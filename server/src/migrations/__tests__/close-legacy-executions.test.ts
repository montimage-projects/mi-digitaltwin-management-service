import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import mongoose from 'mongoose';
import { Scenario } from '../../models/Scenario.js';
import { LEGACY_TEARDOWN_CUTOVER, closeLegacyExecutions } from '../close-legacy-executions.js';

const TEST_MONGODB_URI = `${process.env.SEED_TEST_MONGODB_URI ?? process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017'}/secsim_legacy_exec_${Date.now()}`;
let mongoAvailable = true;

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch {
    mongoAvailable = false;
  }
});

afterAll(async () => {
  if (!mongoAvailable) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const before = new Date(LEGACY_TEARDOWN_CUTOVER.getTime() - 86_400_000);
const after = new Date(LEGACY_TEARDOWN_CUTOVER.getTime() + 60_000);
const exec = (status: string, executedAt: Date, extra: Record<string, unknown> = {}) => ({
  executedAt,
  executedBy: 'tester',
  status,
  namespace: `ns-${status}-${executedAt.getTime()}`,
  deployedServices: [],
  ...extra,
});

describe('closeLegacyExecutions', () => {
  test('closes only pre-cutover completed runs without completedAt, idempotently', async () => {
    if (!mongoAvailable) return;
    const closedAt = new Date(after.getTime() + 5000);
    const scenario = await Scenario.create({
      projectId: new mongoose.Types.ObjectId(),
      title: 'Legacy',
      topology: { yaml: '', nodes: [], edges: [] },
      executions: [
        exec('completed', before), // torn down by pre-#249 code
        exec('completed', after), // settled and still deployed
        exec('running', before), // never closed: left alone
        exec('completed', after, { completedAt: closedAt }), // closed by new code
      ],
    });

    expect(await closeLegacyExecutions()).toBe(1);
    expect(await closeLegacyExecutions()).toBe(0);

    const [legacy, settled, running, closed] = (await Scenario.findById(scenario._id).lean())!
      .executions;
    expect(legacy.completedAt).toEqual(before);
    expect(settled.completedAt).toBeUndefined();
    expect(running.completedAt).toBeUndefined();
    expect(closed.completedAt).toEqual(closedAt);
    expect(legacy.namespace).toBe(`ns-completed-${before.getTime()}`);
  });
});
