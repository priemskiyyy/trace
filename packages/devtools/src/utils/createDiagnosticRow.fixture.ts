import type { RecordedEvent } from "src/types/internal/RecordedEvent";

type DiagnosticRow = Extract<RecordedEvent, { row: "DIAGNOSTIC" }>;

export const createDiagnosticRow = (
  overrides: Partial<DiagnosticRow> & Pick<DiagnosticRow, "id" | "type">,
): DiagnosticRow => ({
  row: "DIAGNOSTIC",
  source: "event",
  destination: { name: "product" },
  event: { id: "e_1" },
  timestamp: 0,
  kind: "EVENT",
  summary: "",
  context: "{}",
  losses: [],
  destinations: [],
  ...overrides,
});
