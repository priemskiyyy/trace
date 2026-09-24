/**
 * One accepted event as every destination and stream listener receives it:
 * deep-frozen, sanitized and shared. It keeps the identity, context and time it
 * had when it was accepted.
 *
 * @example
 * ```ts
 * track: (event) => {
 *   sdk.capture(event.name, event.properties, { uuid: event.id, timestamp: new Date(event.timestamp) });
 *
 *   return { status: "submitted", evidence: "sdk-call-returned" };
 * },
 * ```
 */
export type TrackedEvent<
  TName extends string = string,
  TProperties = Record<string, unknown>,
> = {
  /** A UUID v4, the event's idempotency key everywhere. */
  id: string;
  name: TName;
  properties: TProperties;
  /** The composed context: the defaults, then `trace.context()`, the scope's, and the call's. */
  context: Record<string, unknown>;
  /** Who the event belongs to, as it was when the event was accepted. */
  identity: {
    /** Grows with every change of user; an adapter compares it with `currentGeneration()`. */
    generation: number;
    user: { id: string } | null;
    /** Current values only; removals still to be sent to a provider are not listed. */
    traits: Record<string, unknown>;
    groups: Record<string, { id: string; traits: Record<string, unknown> }>;
  };
  /** When it happened, in epoch milliseconds: the call's `timestamp`, or the Trace's clock. */
  timestamp: number;
};
