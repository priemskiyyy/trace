import type { DiagnosticRecord } from "src/types/internal/DiagnosticRecord";
import type { DiagnosticValue } from "src/types/internal/DiagnosticValue";
import type { TraceDiagnosticEvent } from "src/types/TraceDiagnosticEvent";
import type { TraceDiagnostics } from "src/types/TraceDiagnostics";
import type { TraceSnapshot } from "src/types/TraceSnapshot";
import { isolate } from "src/utils/common/isolate";
import { isPlainObject } from "src/utils/common/isPlainObject";
import { DIAGNOSTIC_TYPES } from "src/utils/constants/diagnostics";

type State =
  | {
      state: "ACTIVE";
      read: () => TraceSnapshot;
      snapshot: TraceSnapshot | null;
    }
  | { state: "DISPOSED"; snapshot: TraceSnapshot };

const copyDiagnosticValue = (
  value: unknown,
  ancestors: Set<object>,
): DiagnosticValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value !== "object" || ancestors.has(value)) {
    return null;
  }

  if (Array.isArray(value)) {
    ancestors.add(value);

    const items = Array.from(value, (item: unknown) =>
      copyDiagnosticValue(item, ancestors),
    );

    ancestors.delete(value);
    Object.freeze(items);

    return items;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  ancestors.add(value);

  const copy = Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      copyDiagnosticValue(nested, ancestors),
    ]),
  );

  ancestors.delete(value);

  return Object.freeze(copy);
};

const getContext = (context: DiagnosticRecord["context"]) => {
  try {
    return copyDiagnosticValue(context ?? null, new Set());
  } catch {
    return null;
  }
};

const getTimestamp = (now: () => number) => {
  try {
    const timestamp = now();

    return Number.isFinite(timestamp) ? timestamp : Date.now();
  } catch {
    return Date.now();
  }
};

export class Diagnostics {
  #state: State;
  #now: () => number;
  #listeners = new Set<() => void>();
  #eventListeners = new Set<(event: TraceDiagnosticEvent) => void>();
  #pending: TraceDiagnosticEvent[] = [];
  #delivering = false;
  #scheduled = false;

  constructor({ read, now }: { read: () => TraceSnapshot; now: () => number }) {
    this.#state = { state: "ACTIVE", read, snapshot: null };
    this.#now = now;
  }

  api: TraceDiagnostics = {
    get: () => {
      const state = this.#state;

      if (state.state === "DISPOSED") {
        return state.snapshot;
      }

      if (state.snapshot === null) {
        state.snapshot = state.read();
      }

      return state.snapshot;
    },
    subscribe: (listener) => {
      if (this.#state.state === "DISPOSED") {
        return () => {};
      }

      const subscription = () => listener();

      this.#listeners.add(subscription);

      return () => {
        this.#listeners.delete(subscription);
      };
    },
    events: {
      subscribe: (listener) => {
        if (this.#state.state === "DISPOSED") {
          return () => {};
        }

        const subscription = (event: TraceDiagnosticEvent) => listener(event);

        this.#eventListeners.add(subscription);

        return () => {
          this.#eventListeners.delete(subscription);
        };
      },
    },
  };

  isDelivering = () => this.#delivering;

  record = (record: DiagnosticRecord) => {
    if (this.#eventListeners.size === 0 || this.#state.state === "DISPOSED") {
      return;
    }

    this.#pending.push(this.#getEvent(record));
    this.#deliver();
  };

  changed = () => {
    if (this.#state.state === "DISPOSED") {
      return;
    }

    this.#state.snapshot = null;

    if (this.#listeners.size === 0 || this.#scheduled) {
      return;
    }

    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      this.#notify();
    });
  };

  dispose = () => {
    if (this.#state.state === "DISPOSED") {
      return;
    }

    this.#state = { state: "DISPOSED", snapshot: this.#state.read() };

    if (this.#eventListeners.size > 0) {
      this.#pending.push(
        this.#getEvent({
          source: "runtime",
          type: DIAGNOSTIC_TYPES.TRACE_DISPOSED,
          destination: null,
          event: null,
        }),
      );
    }

    this.#deliver();
    this.#notify();
    this.#listeners.clear();
  };

  #getEvent(record: DiagnosticRecord): TraceDiagnosticEvent {
    return Object.freeze({
      source: record.source,
      type: record.type,
      destination:
        record.destination === null
          ? null
          : Object.freeze({ name: record.destination }),
      event: record.event === null ? null : Object.freeze({ id: record.event }),
      timestamp: getTimestamp(this.#now),
      context: getContext(record.context),
    });
  }

  #deliver() {
    if (this.#delivering) {
      return;
    }

    this.#delivering = true;

    for (const event of this.#pending) {
      for (const listener of [...this.#eventListeners]) {
        if (this.#eventListeners.has(listener)) {
          isolate(() => listener(event));
        }
      }
    }

    this.#pending = [];
    this.#delivering = false;

    if (this.#state.state === "DISPOSED") {
      this.#eventListeners.clear();
    }
  }

  #notify() {
    for (const listener of [...this.#listeners]) {
      if (this.#listeners.has(listener)) {
        isolate(listener);
      }
    }
  }
}
