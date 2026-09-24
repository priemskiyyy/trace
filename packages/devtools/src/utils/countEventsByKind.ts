import type { RecordedEvent } from "src/types/internal/RecordedEvent";
import type { RecordedEventKind } from "src/types/internal/RecordedEventKind";

export const countEventsByKind = (events: RecordedEvent[]) => {
  const counts: Record<RecordedEventKind, number> = {
    ERROR: 0,
    EVENT: 0,
    DESTINATION: 0,
    IDENTITY: 0,
    CONSENT: 0,
    RUNTIME: 0,
  };

  for (const event of events) {
    counts[event.kind] += 1;
  }

  return counts;
};
