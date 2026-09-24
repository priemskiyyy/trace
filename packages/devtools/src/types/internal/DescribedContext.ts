import type { RecordedEvent } from "src/types/internal/RecordedEvent";

export type DescribedContext = Pick<
  Extract<RecordedEvent, { row: "DIAGNOSTIC" }>,
  "context" | "summary" | "kind" | "losses" | "destinations"
>;
