import type { TraceDiagnosticEvent } from "@priemskiyyy/trace";

import type { DiagnosticType } from "src/types/internal/DiagnosticType";
import type { RecordedEventKind } from "src/types/internal/RecordedEventKind";
import { assertUnreachable } from "src/utils/assertUnreachable";

const DIAGNOSTIC_KINDS = {
  "trace started": null,
  "trace disposed": null,
  "destination ready": null,
  "destination failed": "ERROR",
  "destination disposed": null,
  "destination dispose failed": "ERROR",
  "destination collection failed": "ERROR",
  "user changed": null,
  "user refused": "ERROR",
  "group refused": "ERROR",
  "traits refused": "ERROR",
  "identity step failed": "ERROR",
  "identity step unsupported": null,
  "consent changed": null,
  "event accepted": null,
  "event dropped": null,
  "event submitted": null,
  "event failed": "ERROR",
  "event skipped": null,
  "event indeterminate": null,
  "buffer overflow": "ERROR",
  "flush started": null,
  "flush completed": null,
  "listener failed": "ERROR",
} satisfies Record<DiagnosticType, "ERROR" | null>;

export const getEventKind = (
  event: Pick<TraceDiagnosticEvent, "source" | "type">,
): RecordedEventKind => {
  const isError = Object.entries(DIAGNOSTIC_KINDS).some(
    ([type, kind]) => type === event.type && kind === "ERROR",
  );

  if (isError) {
    return "ERROR";
  }

  if (event.source === "event") {
    return "EVENT";
  }

  if (event.source === "destination") {
    return "DESTINATION";
  }

  if (event.source === "identity") {
    return "IDENTITY";
  }

  if (event.source === "consent") {
    return "CONSENT";
  }

  if (event.source === "runtime") {
    return "RUNTIME";
  }

  return assertUnreachable(event.source);
};
