import type { MockIdentityCall } from "src/mock/types/MockIdentityCall";
import type { MockTrack } from "src/mock/types/MockTrack";
import type { TrackResult } from "src/types/TrackResult";

/**
 * Configures the mock adapter, which is well behaved by default and can be told
 * to hold, leave methods out or misbehave.
 *
 * @example
 * ```ts
 * const mock = createMockAdapter({ hold: true, flush: "hold", identity: false });
 * ```
 */
export type MockAdapterOptions = {
  /** The adapter's name, `mock` by default. */
  name?: string;
  /** Each `track` waits until the test answers it through `settle` or `fail`. */
  hold?: boolean;
  /** `false` leaves `identify`, `traits`, `group` and `reset` out of every session. */
  identity?: boolean;
  /** `false` leaves `collection` out of every session. */
  collection?: boolean;
  /** `false` leaves `flush` out of every session, and `"hold"` makes each flush wait for the test. */
  flush?: boolean | "hold";
  /** Runs at every `open`; throwing fails the start. */
  onOpen?: () => void;
  /** Answers a `track` at once, or throws; answering nothing keeps the default answer. */
  onTrack?: (track: MockTrack) => TrackResult | void;
  /** Runs at every identity call; what it throws or answers is the call's answer. */
  onIdentity?: (call: MockIdentityCall) => void | Promise<void>;
};
