import { pathToFileURL } from 'node:url';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Scenario } from '../models/Scenario.js';

/**
 * When #249 (execution reports) landed, teardown started stamping
 * `completedAt`. Before that, teardown only set `status: 'completed'`, which
 * is also what the console saves when a still-deployed rollout settles — so
 * those torn-down runs would read as live (a namespace, no `completedAt`,
 * not failed) on the Monitoring page and in `secsim_live_executions`.
 *
 * Runs started before the cutover that are `completed` without `completedAt`
 * are closed with `completedAt = executedAt`. Idempotent and bounded by the
 * cutover, so it only ever touches pre-#249 records; a pre-#249 run that is
 * somehow still deployed merely drops off the dashboard (teardown still works).
 *
 * Run once after upgrading: `npm run migrate:close-legacy-executions -w server`.
 * The cutover is #249's merge time on main — runs torn down by an older
 * deployment after that time are not covered.
 */
export const LEGACY_TEARDOWN_CUTOVER = new Date('2026-09-24T18:22:44Z');

export async function closeLegacyExecutions(): Promise<number> {
  const isLegacy = {
    $and: [
      { $eq: ['$$e.status', 'completed'] },
      { $eq: [{ $ifNull: ['$$e.completedAt', null] }, null] },
      { $lt: ['$$e.executedAt', LEGACY_TEARDOWN_CUTOVER] },
    ],
  };
  const result = await Scenario.updateMany(
    {
      executions: {
        $elemMatch: {
          status: 'completed',
          completedAt: null,
          executedAt: { $lt: LEGACY_TEARDOWN_CUTOVER },
        },
      },
    },
    [
      {
        $set: {
          executions: {
            $map: {
              input: '$executions',
              as: 'e',
              in: {
                $cond: [
                  isLegacy,
                  { $mergeObjects: ['$$e', { completedAt: '$$e.executedAt' }] },
                  '$$e',
                ],
              },
            },
          },
        },
      },
    ],
    { updatePipeline: true }
  );
  return result.modifiedCount;
}

const migrate = async (): Promise<void> => {
  console.info('Starting migration: close-legacy-executions\n');
  try {
    await connectDatabase();
    const scenarios = await closeLegacyExecutions();
    console.info(`Closed legacy executions in ${scenarios} scenario(s).`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

// Run only as a script, not when imported (tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void migrate();
}
