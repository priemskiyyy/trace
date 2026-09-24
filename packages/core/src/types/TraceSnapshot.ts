import type { ConsentDecision } from "src/types/ConsentDecision";
import type { DestinationStatus } from "src/types/DestinationStatus";
import type { TraceStatus } from "src/types/TraceStatus";

/**
 * Frozen counts and statuses from diagnostics. It never holds event data or a
 * provider's error, and the user id in it is the one the application set.
 *
 * @example
 * ```ts
 * const { pendingReceipts, destinations } = trace.diagnostics.get();
 * ```
 */
export type TraceSnapshot = {
  status: TraceStatus;
  /** The current identity generation, which grows with every change of user, and the user. */
  identity: { generation: number; user: { id: string } | null };
  consent: Record<string, ConsentDecision>;
  /** Receipts of accepted events that have not settled yet. */
  pendingReceipts: number;
  destinations: {
    name: string;
    /** The adapter's own name, such as `posthog`. */
    adapter: { name: string };
    /** The state alone; a failed destination's error is on `trace.destination(name).status`. */
    status: { state: DestinationStatus["state"] };
    /** Events waiting for the destination to be ready, or for an identity step ahead of them. */
    buffered: number;
    /** Events handed to the provider and not answered yet. */
    inFlight: number;
  }[];
};
