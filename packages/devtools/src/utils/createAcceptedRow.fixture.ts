import type { RecordedEvent } from "src/types/internal/RecordedEvent";

type AcceptedRow = Extract<RecordedEvent, { row: "ACCEPTED" }>;

export const createAcceptedRow = (
  overrides: Partial<AcceptedRow> & Pick<AcceptedRow, "id" | "type">,
): AcceptedRow => ({
  row: "ACCEPTED",
  source: "event",
  destination: null,
  event: { id: "e_1" },
  timestamp: 0,
  kind: "EVENT",
  summary: "",
  values: "{}",
  ...overrides,
});
