/**
 * Tiny perf-trace helper for runtime measurements (Step 12 POC + future
 * latency-sensitive workflows). Uses `performance.now()` so resolution
 * is ~5µs in modern browsers.
 *
 * Usage:
 *
 *   const trace = newTrace('rvf.widgetConfig.read');
 *   for (let i = 0; i < 20; i++) {
 *     const stop = trace.startOp();
 *     await readOp();
 *     stop();
 *   }
 *   console.log(summarize(trace));
 *
 * Or one-shot:
 *
 *   const ms = await time(() => readOp());
 */

export interface PerfTrace {
  readonly label: string;
  readonly samples: number[];
  startOp(): () => void;
  reset(): void;
}

export interface PerfSummary {
  label: string;
  count: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  min_ms: number;
  max_ms: number;
  mean_ms: number;
  total_ms: number;
}

export function newTrace(label: string): PerfTrace {
  const samples: number[] = [];
  return {
    label,
    samples,
    startOp() {
      const t0 = performance.now();
      return () => samples.push(performance.now() - t0);
    },
    reset() {
      samples.length = 0;
    },
  };
}

export async function time<T>(fn: () => Promise<T> | T): Promise<{ value: T; ms: number }> {
  const t0 = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - t0 };
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function summarize(trace: PerfTrace): PerfSummary {
  const s = trace.samples;
  const n = s.length;
  if (n === 0) {
    return {
      label: trace.label,
      count: 0,
      p50_ms: 0, p95_ms: 0, p99_ms: 0,
      min_ms: 0, max_ms: 0, mean_ms: 0, total_ms: 0,
    };
  }
  const total = s.reduce((a, b) => a + b, 0);
  return {
    label: trace.label,
    count: n,
    p50_ms: round(percentile(s, 50)),
    p95_ms: round(percentile(s, 95)),
    p99_ms: round(percentile(s, 99)),
    min_ms: round(Math.min(...s)),
    max_ms: round(Math.max(...s)),
    mean_ms: round(total / n),
    total_ms: round(total),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
