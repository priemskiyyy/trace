import type { MockFlush } from "src/mock/types/MockFlush";
import type { MockIdentityCall } from "src/mock/types/MockIdentityCall";
import type { TrackedEvent } from "src/types/TrackedEvent";

/**
 * What one opened mock session recorded. It is also the session's `native`.
 *
 * @example
 * ```ts
 * expect(mock.sessions[0]?.events.map(({ name }) => name)).toEqual(["App Opened"]);
 * ```
 */
export type MockSession = {
  events: TrackedEvent[];
  /** Every `identify`, `traits`, `group` and `reset`, in the order they were called. */
  identity: MockIdentityCall[];
  /** Each collection switch: `false` for off and `true` for on. */
  collection: boolean[];
  flushes: MockFlush[];
  /** How many times the session's `dispose` ran. */
  disposeCount: number;
};
