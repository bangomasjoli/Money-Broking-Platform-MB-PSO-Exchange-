/**
 * FND-01 §5 Time Service — server-authoritative UTC (FND-FR-007).
 * All regulated timing decisions must use this, never client-supplied time.
 */

export type ClockDriftStatus = "normal" | "degraded" | "unknown";

export interface TimeService {
  nowUtc(): string;
  nowDate(): Date;
  driftStatus(): ClockDriftStatus;
  source(): string;
}

/**
 * Default server clock. Drift/NTP verification is an ops concern; MVP reports "normal"
 * and exposes a seam for a real NTP-drift probe (blueprint §13 open item, readiness §04.3.2).
 */
export function createSystemTimeService(source = "system_clock"): TimeService {
  return {
    nowUtc: () => new Date().toISOString(),
    nowDate: () => new Date(),
    driftStatus: () => "normal",
    source: () => source,
  };
}

export const systemTime: TimeService = createSystemTimeService();
