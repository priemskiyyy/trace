import { isolate } from "src/utils/common/isolate";

export class ValueStore<TValue> {
  #snapshot: { value: TValue };
  #listeners = new Set<() => void>();

  constructor(initial: TValue) {
    this.#snapshot = { value: initial };
  }

  get = () => this.#snapshot.value;

  set = (next: TValue) => {
    if (Object.is(next, this.#snapshot.value)) {
      return;
    }

    const snapshot = { value: next };

    this.#snapshot = snapshot;

    for (const listener of [...this.#listeners]) {
      if (snapshot !== this.#snapshot) {
        return;
      }

      if (this.#listeners.has(listener)) {
        isolate(listener);
      }
    }
  };

  subscribe = (listener: () => void) => {
    const subscription = () => listener();

    this.#listeners.add(subscription);

    return () => {
      this.#listeners.delete(subscription);
    };
  };
}
