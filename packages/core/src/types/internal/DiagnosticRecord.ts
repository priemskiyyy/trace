import type { DiagnosticValue } from "src/types/internal/DiagnosticValue";
import type { TraceDiagnosticEvent } from "src/types/TraceDiagnosticEvent";
import type { TraceDiagnosticType } from "src/types/TraceDiagnosticType";

export type DiagnosticRecord = {
  source: TraceDiagnosticEvent["source"];
  type: TraceDiagnosticType;
  destination: string | null;
  event: string | null;
  context?: Record<string, DiagnosticValue>;
};
