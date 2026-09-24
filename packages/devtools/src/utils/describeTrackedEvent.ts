import type { TrackedEvent } from "@priemskiyyy/trace";

import { formatContextSummary } from "src/formatting/formatContextSummary";
import { formatContextText } from "src/formatting/formatContextText";
import type { RecordedEvent } from "src/types/internal/RecordedEvent";
import { inspectContext } from "src/utils/inspectContext";

const formatValues = (event: TrackedEvent<string, unknown>) => {
  try {
    return formatContextText(
      inspectContext({
        properties: event.properties,
        context: event.context,
        traits: event.identity.traits,
        groups: event.identity.groups,
      }),
    );
  } catch {
    return "[Unable to inspect this value]";
  }
};

export const describeTrackedEvent = (
  event: TrackedEvent<string, unknown>,
): Omit<Extract<RecordedEvent, { row: "ACCEPTED" }>, "id"> => ({
  row: "ACCEPTED",
  source: "event",
  type: event.name,
  destination: null,
  event: { id: event.id },
  timestamp: event.timestamp,
  kind: "EVENT",
  summary: formatContextSummary({
    generation: event.identity.generation,
    user: event.identity.user,
  }),
  values: formatValues(event),
});
