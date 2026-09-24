import type { FlushContext } from "src/types/FlushContext";
import type { FlushResult } from "src/types/FlushResult";
import type { GroupUpdate } from "src/types/GroupUpdate";
import type { IdentifyUpdate } from "src/types/IdentifyUpdate";
import type { TrackContext } from "src/types/TrackContext";
import type { TrackedEvent } from "src/types/TrackedEvent";
import type { TrackResult } from "src/types/TrackResult";
import type { TraitsUpdate } from "src/types/TraitsUpdate";

/**
 * One opened destination. `track` receives frozen, sanitized events, and each
 * optional method is there only for something the provider can do.
 *
 * @example
 * ```ts
 * const session: AnalyticsSession<Beacon> = {
 *   native: beacon,
 *   track: (event) => {
 *     beacon.send(event.name, event.properties);
 *
 *     return { status: "submitted", evidence: "sdk-call-returned" };
 *   },
 *   reset: () => beacon.reset(),
 * };
 * ```
 */
export type AnalyticsSession<TNative = unknown> = {
  /** The SDK as the application initialized it, which `destination(name).native` hands back. */
  native: TNative;
  track: (
    event: TrackedEvent,
    context: TrackContext,
  ) => TrackResult | Promise<TrackResult>;
  /** Tells the provider who the user is: a browser or mobile SDK switches its own user, a server SDK updates that user's profile. */
  identify?: (update: IdentifyUpdate) => void | Promise<void>;
  traits?: (update: TraitsUpdate) => void | Promise<void>;
  group?: (update: GroupUpdate) => void | Promise<void>;
  /** Forgets the provider's user. Leave it out when the provider cannot, because a reset that throws is a failure. */
  reset?: () => void | Promise<void>;
  /** Turns the provider's own collection off and on as consent changes, only where that switch is reversible. */
  collection?: (enabled: boolean) => void | Promise<void>;
  /** Waits for the provider's own queue. Leave it out when the provider has none. */
  flush?: (context: FlushContext) => FlushResult | Promise<FlushResult>;
  /** Takes back what `open` set up. The SDK itself stays the application's to close. */
  dispose?: () => void | Promise<void>;
};
