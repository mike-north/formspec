import type { FormSpecPerformanceEvent } from "@formspec/analysis/internal";

export function formatPerformanceEvent(event: FormSpecPerformanceEvent): string {
  const detailEntries = Object.entries(event.detail ?? {})
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  return `${event.durationMs.toFixed(1)}ms ${event.name}${detailEntries === "" ? "" : ` ${detailEntries}`}`;
}
