import type { DestinationOutcome, MappingLoss } from "@priemskiyyy/trace";
import { match } from "ts-pattern";

/** The values a destination reported it could not carry whole. Only an answer that reached the provider has any. */
export const getOutcomeLosses = (
  outcome: DestinationOutcome | null | undefined,
): MappingLoss[] =>
  match(outcome)
    .with({ status: "submitted" }, ({ losses }) => losses)
    .with(
      { status: "dropped", reason: "provider-filtered" },
      ({ losses }) => losses,
    )
    .otherwise(() => []);
