import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { Infrastructure } from '../../models/Infrastructure.js';
import { Scenario } from '../../models/Scenario.js';
import { AppError } from '../../middleware/errorHandler.js';
import {
  buildClientFromInfrastructure,
  collectNewPodLogs,
  type PodLogLine,
} from '../../services/kubernetesDeploy.js';
import { logger } from '../../utils/logger.js';
import { proposeResponse } from './boss-proposal.js';
import { IncidentAggregator, type Incident, type Triage } from './incidents.js';
import { parseMmtReport } from './mmt-report.js';
import { fallbackTriage, triageIncident } from './triage.js';

export interface MonitorDeps {
  triage: (incident: Incident) => Promise<Triage>;
  propose: (incident: Incident) => Promise<string>;
}

interface Watch {
  timer: ReturnType<typeof setInterval>;
  busy: boolean;
}

/**
 * Monitor agent runtime: watches one execution's pod logs (independently of
 * any open console), turns MMT security reports into incidents, triages each
 * new incident with a small model, then hands it to the Boss Agent for a
 * response proposal. Incidents are kept in memory (Step 1).
 */
export class MonitorService {
  private readonly watches = new Map<string, Watch>();
  private readonly aggregators = new Map<string, IncidentAggregator>();
  private readonly incidents = new Map<string, Incident[]>();

  constructor(
    private readonly deps: MonitorDeps = { triage: triageIncident, propose: proposeResponse }
  ) {}

  async start(
    executionId: string
  ): Promise<{ executionId: string; namespace: string; services: string[] }> {
    if (!mongoose.isValidObjectId(executionId)) throw new AppError('Invalid execution id', 400);
    const scenario = await Scenario.findOne({ 'executions._id': executionId });
    const execution = scenario?.executions.find((e) => e._id?.toString() === executionId);
    if (!scenario || !execution) throw new AppError('Execution not found', 404);
    if (!execution.namespace || !scenario.infrastructureId) {
      throw new AppError('Execution has no deployed namespace to monitor', 409);
    }
    const infrastructure = await Infrastructure.findById(scenario.infrastructureId);
    if (!infrastructure) throw new AppError('Assigned infrastructure not found', 404);

    const namespace = execution.namespace;
    const services = (execution.deployedServices ?? [])
      .map((s) => s.name)
      .filter((n): n is string => Boolean(n));
    this.stop(executionId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clients = buildClientFromInfrastructure(infrastructure as any);
    const seen = new Map<string, number>();
    const watch: Watch = {
      busy: false,
      timer: setInterval(() => void poll(), env.MONITOR_POLL_MS),
    };
    const poll = async () => {
      if (watch.busy) return;
      watch.busy = true;
      try {
        this.ingest(
          executionId,
          await collectNewPodLogs(clients, { namespace, names: services, seen })
        );
      } catch (error) {
        logger.warn('Monitor poll failed', {
          executionId,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        watch.busy = false;
      }
    };
    this.watches.set(executionId, watch);
    logger.info('Monitor agent watching execution', { executionId, namespace, services });
    return { executionId, namespace, services };
  }

  stop(executionId: string): boolean {
    const watch = this.watches.get(executionId);
    if (!watch) return false;
    clearInterval(watch.timer);
    this.watches.delete(executionId);
    return true;
  }

  isWatching(executionId: string): boolean {
    return this.watches.has(executionId);
  }

  list(executionId?: string): Incident[] {
    if (executionId) return this.incidents.get(executionId) ?? [];
    return [...this.incidents.values()].flat();
  }

  /** Fold log lines into incidents; returns the incidents opened by this batch. */
  ingest(executionId: string, entries: Pick<PodLogLine, 'name' | 'line'>[]): Incident[] {
    let aggregator = this.aggregators.get(executionId);
    if (!aggregator) {
      aggregator = new IncidentAggregator(executionId, env.MONITOR_INCIDENT_GAP_MS);
      this.aggregators.set(executionId, aggregator);
    }
    const opened: Incident[] = [];
    for (const entry of entries) {
      const alert = parseMmtReport(entry.line);
      if (!alert) continue;
      const { incident, isNew } = aggregator.add(alert, entry.name);
      if (!isNew) continue;
      const list = this.incidents.get(executionId) ?? [];
      list.push(incident);
      this.incidents.set(executionId, list);
      opened.push(incident);
      void this.process(incident);
    }
    return opened;
  }

  /** Triage, then Boss proposal. Never throws: failures are recorded on the incident. */
  async process(incident: Incident): Promise<void> {
    try {
      incident.triage = await this.deps.triage(incident);
      incident.triageSource = 'model';
    } catch (error) {
      logger.warn('Monitor triage failed, using fallback', {
        id: incident.id,
        error: String(error),
      });
      incident.triage = fallbackTriage(incident);
      incident.triageSource = 'fallback';
    }
    incident.triagedAt = new Date().toISOString();
    incident.status = 'triaged';
    try {
      incident.proposal = await this.deps.propose(incident);
      incident.proposedAt = new Date().toISOString();
      incident.status = 'proposed';
    } catch (error) {
      incident.status = 'error';
      incident.error = `Boss proposal failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

let instance: MonitorService | null = null;
export function getMonitorService(): MonitorService {
  if (!instance) instance = new MonitorService();
  return instance;
}
