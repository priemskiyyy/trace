import type { TraceDiagnosticEvent, TrackedEvent } from "@priemskiyyy/trace";

import type { RecordedEvent } from "src/types/internal/RecordedEvent";
import { DEFAULT_MAX_EVENTS } from "src/utils/constants/defaults";
import { describeContext } from "src/utils/describeContext";
import { describeTrackedEvent } from "src/utils/describeTrackedEvent";

// Clamped, never thrown on: a bad prop must not crash the host application.
const clampLimit = (limit: number) => {
  if (Number.isNaN(limit)) {
    return DEFAULT_MAX_EVENTS;
  }

  return Math.min(1_000, Math.max(1, Math.trunc(limit)));
};

export class EventLog {
  #events: RecordedEvent[] = [];
  #listeners = new Set<() => void>();
  #limit = DEFAULT_MAX_EVENTS;
  #next = 0;
  #scheduled = false;

  get = () => this.#events;

  setLimit = (limit: number) => {
    this.#limit = clampLimit(limit);

    if (this.#events.length <= this.#limit) {
      return;
    }

    this.#events = this.#events.slice(0, this.#limit);
    this.#notify();
  };

  subscribe = (listener: () => void) => {
    // Wrapped, so the same function subscribed twice is two subscriptions.
    const notify = () => listener();

    this.#listeners.add(notify);

    return () => {
      this.#listeners.delete(notify);
    };
  };

  add = (event: TraceDiagnosticEvent) => {
    this.#record({
      row: "DIAGNOSTIC",
      id: this.#getNextId(),
      source: event.source,
      type: event.type,
      destination: event.destination,
      event: event.event,
      timestamp: event.timestamp,
      ...describeContext(event),
    });
  };

  accept = (event: TrackedEvent<string, unknown>) => {
    this.#record({ ...describeTrackedEvent(event), id: this.#getNextId() });
  };

  clear = () => {
    this.#events = [];
    this.#notify();
  };

  #getNextId() {
    this.#next += 1;

    return this.#next;
  }

  #record(entry: RecordedEvent) {
    this.#events = [entry, ...this.#events].slice(0, this.#limit);
    this.#notify();
  }

  #notify() {
    if (this.#scheduled) {
      return;
    }

    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;

      for (const listener of [...this.#listeners]) {
        if (!this.#listeners.has(listener)) {
          continue;
        }

        listener();
      }
    });
  }
}
