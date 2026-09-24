import type { EventOutcome } from "src/types/internal/EventOutcome";

export const formatOutcome = ({
  destination,
  status,
  summary,
}: Pick<EventOutcome, "destination" | "status" | "summary">) => {
  if (summary === "") {
    return `${destination} · ${status}`;
  }

  return `${destination} · ${status} · ${summary}`;
};
