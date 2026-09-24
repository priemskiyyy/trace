import type { ObservedDestination } from "src/types/internal/ObservedDestination";

export const formatDestinationLine = ({
  adapter,
  status,
  buffered,
  inFlight,
}: Pick<
  ObservedDestination,
  "adapter" | "status" | "buffered" | "inFlight"
>) => {
  const parts = [adapter.name, status.state];

  if (buffered > 0) {
    parts.push(`${buffered} buffered`);
  }

  if (inFlight > 0) {
    parts.push(`${inFlight} in flight`);
  }

  return parts.join(" · ");
};
