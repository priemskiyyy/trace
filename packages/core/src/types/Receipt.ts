import type { ObservableValue } from "src/types/ObservableValue";
import type { ReceiptStatus } from "src/types/ReceiptStatus";

/**
 * What `track` answers at once. `settled` resolves once the event is dropped or
 * every destination it was routed to has an outcome, and it never rejects.
 *
 * @example
 * ```ts
 * const receipt = trace.track("App Opened");
 * const status = await receipt.settled;
 * ```
 */
export type Receipt<TName extends string = string> = {
  /** The event's id, the idempotency key every destination receives. */
  id: string;
  status: ObservableValue<ReceiptStatus<TName>>;
  settled: Promise<ReceiptStatus<TName>>;
};
