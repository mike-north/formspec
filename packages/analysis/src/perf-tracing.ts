export type FormSpecPerformanceDetailValue = boolean | number | string;

export interface FormSpecPerformanceEvent {
  readonly name: string;
  readonly durationMs: number;
  readonly detail?: Readonly<Record<string, FormSpecPerformanceDetailValue>>;
}

export interface FormSpecPerformanceRecorder {
  readonly events: readonly FormSpecPerformanceEvent[];
  measure<T>(
    name: string,
    detail: Readonly<Record<string, FormSpecPerformanceDetailValue>> | undefined,
    callback: () => T
  ): T;
  record(event: FormSpecPerformanceEvent): void;
}

const EMPTY_PERFORMANCE_EVENTS: readonly FormSpecPerformanceEvent[] = Object.freeze([]);

function getHighResolutionTime(): number {
  return performance.now();
}

class FormSpecPerformanceRecorderImpl implements FormSpecPerformanceRecorder {
  private readonly mutableEvents: FormSpecPerformanceEvent[] = [];

  public get events(): readonly FormSpecPerformanceEvent[] {
    return this.mutableEvents;
  }

  public measure<T>(
    name: string,
    detail: Readonly<Record<string, FormSpecPerformanceDetailValue>> | undefined,
    callback: () => T
  ): T {
    const startedAt = getHighResolutionTime();
    try {
      return callback();
    } finally {
      this.record({
        name,
        durationMs: getHighResolutionTime() - startedAt,
        ...(detail === undefined ? {} : { detail }),
      });
    }
  }

  public record(event: FormSpecPerformanceEvent): void {
    this.mutableEvents.push(event);
  }
}

class NoopFormSpecPerformanceRecorderImpl implements FormSpecPerformanceRecorder {
  public get events(): readonly FormSpecPerformanceEvent[] {
    return EMPTY_PERFORMANCE_EVENTS;
  }

  public measure<T>(
    _name: string,
    _detail: Readonly<Record<string, FormSpecPerformanceDetailValue>> | undefined,
    callback: () => T
  ): T {
    return callback();
  }

  public record(_event: FormSpecPerformanceEvent): void {
    // Intentionally empty.
  }
}

export const NOOP_FORMSPEC_PERFORMANCE_RECORDER: FormSpecPerformanceRecorder =
  new NoopFormSpecPerformanceRecorderImpl();

export function createFormSpecPerformanceRecorder(): FormSpecPerformanceRecorder {
  return new FormSpecPerformanceRecorderImpl();
}

export function getFormSpecPerformanceNow(): number {
  return getHighResolutionTime();
}

export function optionalMeasure<T>(
  recorder: FormSpecPerformanceRecorder | undefined,
  name: string,
  detail: Readonly<Record<string, FormSpecPerformanceDetailValue>> | undefined,
  callback: () => T
): T {
  return (recorder ?? NOOP_FORMSPEC_PERFORMANCE_RECORDER).measure(name, detail, callback);
}
