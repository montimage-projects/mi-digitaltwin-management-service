import { Scenario } from '../models/Scenario.js';
import { logger } from '../utils/logger.js';

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
  if (result.modifiedCount > 0) {
    logger.info('Closed torn-down executions recorded before completedAt existed', {
      scenarios: result.modifiedCount,
    });
  }
  return result.modifiedCount;
}
