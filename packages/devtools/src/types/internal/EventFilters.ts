import type { RecordedEventKind } from "src/types/internal/RecordedEventKind";

export type EventFilters = {
  destination: string | null;
  query: string;
  kind: RecordedEventKind | null;
};
