import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { DropReason } from "src/types/DropReason";

/**
 * Where an event stands: `dropped` at once when it reached no destination,
 * `pending` with a `null` outcome for each destination still at work, then `settled`.
 *
 * @example
 * ```ts
 * const status: ReceiptStatus = trace.track("App Opened").status.get();
 * ```
 */
export type ReceiptStatus<TName extends string = string> =
  | {
      state: "dropped";
      reason: "invalid";
      issues: { path: string; message: string }[];
    }
  | { state: "dropped"; reason: Exclude<DropReason, "invalid"> }
  | {
      state: "pending";
      outcomes: Partial<Record<TName, DestinationOutcome | null>>;
    }
  | { state: "settled"; outcomes: Partial<Record<TName, DestinationOutcome>> };
