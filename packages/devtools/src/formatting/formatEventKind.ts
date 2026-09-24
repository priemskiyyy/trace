import type { RecordedEventKind } from "src/types/internal/RecordedEventKind";

const LABELS = {
  ERROR: "Errors",
  EVENT: "Events",
  DESTINATION: "Destinations",
  IDENTITY: "Identity",
  CONSENT: "Consent",
  RUNTIME: "Runtime",
} satisfies Record<RecordedEventKind, string>;

export const formatEventKind = (kind: RecordedEventKind) => LABELS[kind];
