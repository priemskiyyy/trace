import type { TraceDiagnosticEvent } from "@priemskiyyy/trace";

import type { ContextLoss } from "src/types/internal/ContextLoss";
import type { RecordedEventKind } from "src/types/internal/RecordedEventKind";

type RecordedFields = {
  id: number;
  source: TraceDiagnosticEvent["source"];
  type: string;
  destination: { name: string } | null;
  timestamp: number;
  kind: RecordedEventKind;
  summary: string;
};

export type RecordedEvent =
  | (RecordedFields & {
      row: "DIAGNOSTIC";
      event: { id: string } | null;
      context: string;
      losses: ContextLoss[];
      destinations: string[];
    })
  | (RecordedFields & {
      row: "ACCEPTED";
      event: { id: string };
      values: string;
    });
