import type { EventFilters } from "src/types/internal/EventFilters";
import type { RecordedEvent } from "src/types/internal/RecordedEvent";
import { assertUnreachable } from "src/utils/assertUnreachable";

const getSearchText = (event: RecordedEvent) => {
  const text = `${event.type} ${event.destination?.name ?? event.source} ${event.event?.id ?? ""} ${event.summary}`;

  if (event.row === "DIAGNOSTIC") {
    return `${text} ${event.context}`;
  }

  if (event.row === "ACCEPTED") {
    return text;
  }

  return assertUnreachable(event);
};

export const filterEvents = (
  events: RecordedEvent[],
  filters: EventFilters,
) => {
  const query = filters.query.trim().toLowerCase();

  return events.filter((event) => {
    if (filters.kind !== null && event.kind !== filters.kind) {
      return false;
    }

    // What belongs to no destination stays: a dropped event or an idle Trace is often why a destination saw nothing.
    const isOtherDestination =
      filters.destination !== null &&
      event.destination !== null &&
      event.destination.name !== filters.destination;

    if (isOtherDestination) {
      return false;
    }

    return getSearchText(event).toLowerCase().includes(query);
  });
};
