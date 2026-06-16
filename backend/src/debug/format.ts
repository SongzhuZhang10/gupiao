export interface DebugStepReport {
  name: string;
  ok: boolean;
  durationMs: number;
  data?: unknown;
  error?: string;
}

export interface DebugReport {
  command: string;
  ok: boolean;
  durationMs: number;
  data?: unknown;
  steps?: DebugStepReport[];
  error?: { message: string; details?: unknown };
  hints?: string[];
}

export function formatDebugReport(report: DebugReport): string {
  return JSON.stringify(report, null, 2);
}
