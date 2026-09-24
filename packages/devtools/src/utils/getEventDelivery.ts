import type { DestinationOutcome } from "@priemskiyyy/trace";

import type { DiagnosticType } from "src/types/internal/DiagnosticType";
import type { EventOutcome } from "src/types/internal/EventOutcome";
import type { RecordedEvent } from "src/types/internal/RecordedEvent";

type OutcomeType = Extract<
  DiagnosticType,
  `event ${DestinationOutcome["status"]}`
>;

const OUTCOME_STATUSES = {
  "event submitted": "submitted",
  "event dropped": "dropped",
  "event skipped": "skipped",
  "event failed": "failed",
  "event indeterminate": "indeterminate",
} satisfies Record<OutcomeType, DestinationOutcome["status"]>;

export const getEventDelivery = (
  events: RecordedEvent[],
  accepted: Extract<RecordedEvent, { row: "ACCEPTED" }>,
) => {
  const diagnostics = events.flatMap((event) => {
    if (event.row !== "DIAGNOSTIC" || event.event?.id !== accepted.event.id) {
      return [];
    }

    return [event];
  });

  const acceptance = diagnostics.find(
    (event) => event.type === "event accepted",
  );

  const landed = diagnostics.flatMap((event): EventOutcome[] => {
    const status = Object.entries(OUTCOME_STATUSES).find(
      ([type]) => type === event.type,
    )?.[1];

    if (status === undefined || event.destination === null) {
      return [];
    }

    return [
      {
        destination: event.destination.name,
        status,
        summary: event.summary,
        losses: event.losses,
      },
    ];
  });

  const route = acceptance?.destinations ?? [];

  const routed = route.map(
    (destination): EventOutcome =>
      landed.find((outcome) => outcome.destination === destination) ?? {
        destination,
        status: "pending",
        summary: "",
        losses: [],
      },
  );

  const unrouted = landed.filter(
    (outcome) => !route.includes(outcome.destination),
  );

  return {
    losses: acceptance?.losses ?? [],
    outcomes: [...routed, ...unrouted],
  };
};
