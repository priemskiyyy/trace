import { unrefTimer } from "src/utils/internal/destinations/unrefTimer";

type Waiting<TEntry> = { entry: TEntry; acceptedAt: number };

type Options<TEntry> = {
  capacity: number;
  maxAge: number;
  now: () => number;
  drop: (entry: TEntry, reason: "overflow" | "expired") => void;
};

export class LaneBuffer<TEntry> {
  #options: Options<TEntry>;
  #waiting: Waiting<TEntry>[] = [];
  #expiry: ReturnType<typeof setTimeout> | null = null;

  constructor(options: Options<TEntry>) {
    this.#options = options;
  }

  size = () => this.#waiting.length;

  values = () => this.#waiting.map(({ entry }) => entry);

  push = (entry: TEntry) => {
    this.#waiting.push({ entry, acceptedAt: this.#options.now() });

    const pushedOut =
      this.#waiting.length > this.#options.capacity
        ? this.#waiting.shift()
        : undefined;

    this.#schedule();

    if (pushedOut !== undefined) {
      this.#options.drop(pushedOut.entry, "overflow");
    }
  };

  shift = () => {
    const oldest = this.#waiting.shift();

    this.#schedule();

    return oldest === undefined ? null : oldest.entry;
  };

  remove = (predicate: (entry: TEntry) => boolean) => {
    const kept: Waiting<TEntry>[] = [];
    const removed: TEntry[] = [];

    for (const waiting of this.#waiting) {
      if (predicate(waiting.entry)) {
        removed.push(waiting.entry);

        continue;
      }

      kept.push(waiting);
    }

    this.#waiting = kept;
    this.#schedule();

    return removed;
  };

  #schedule() {
    if (this.#expiry !== null) {
      clearTimeout(this.#expiry);
      this.#expiry = null;
    }

    const oldest = this.#waiting[0];

    if (oldest === undefined) {
      return;
    }

    const time = this.#options.now();

    for (const waiting of this.#waiting) {
      if (waiting.acceptedAt > time) {
        waiting.acceptedAt = time;
      }
    }

    this.#expiry = setTimeout(
      this.#expire,
      Math.max(0, oldest.acceptedAt + this.#options.maxAge - time),
    );
    unrefTimer(this.#expiry);
  }

  #expire = () => {
    const time = this.#options.now();
    const expired: TEntry[] = [];

    let oldest = this.#waiting[0];

    while (
      oldest !== undefined &&
      time - oldest.acceptedAt >= this.#options.maxAge
    ) {
      this.#waiting.shift();
      expired.push(oldest.entry);
      oldest = this.#waiting[0];
    }

    this.#schedule();

    for (const entry of expired) {
      this.#options.drop(entry, "expired");
    }
  };
}
