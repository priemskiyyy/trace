import type { DiagnosticValue } from "src/types/internal/DiagnosticValue";
import type { TraceDiagnosticEvent } from "src/types/TraceDiagnosticEvent";
import type { DIAGNOSTIC_TYPES } from "src/utils/constants/diagnostics";

export type DiagnosticRecord = {
  source: TraceDiagnosticEvent["source"];
  type: (typeof DIAGNOSTIC_TYPES)[keyof typeof DIAGNOSTIC_TYPES];
  destination: string | null;
  event: string | null;
  context?: Record<string, DiagnosticValue>;
};
