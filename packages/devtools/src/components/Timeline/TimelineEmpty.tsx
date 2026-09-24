import { useTimeline } from "src/components/Timeline/useTimeline";
import { assertUnreachable } from "src/utils/assertUnreachable";

type EmptyStateVariant = "NO_MATCHES" | "PAUSED" | "WAITING";

const getEmptyStateVariant = (
  isFiltered: boolean,
  isPaused: boolean,
): EmptyStateVariant => {
  if (isFiltered) {
    return "NO_MATCHES";
  }

  if (isPaused) {
    return "PAUSED";
  }

  return "WAITING";
};

export const TimelineEmpty = () => {
  const timeline = useTimeline();

  const variant = () =>
    getEmptyStateVariant(timeline.filters.isFiltered(), timeline.isPaused());

  return (
    <>
      {(() => {
        const current = variant();

        if (current === "NO_MATCHES") {
          return (
            <>
              <strong>No matching events</strong>
              <p>Try another search, or show all destinations and kinds.</p>
              <button type="button" onClick={() => timeline.filters.clear()}>
                Clear filters
              </button>
            </>
          );
        }

        if (current === "PAUSED") {
          return (
            <>
              <strong>Recording paused</strong>
              <p>
                Your application keeps tracking. Resume to record new events.
              </p>
            </>
          );
        }

        if (current === "WAITING") {
          return (
            <>
              <strong>Waiting for events</strong>
              <p>
                Accepted events, destination outcomes, identity and consent
                changes appear here as your application runs. Values stay hidden
                until you turn on Show values.
              </p>
            </>
          );
        }

        return assertUnreachable(current);
      })()}
    </>
  );
};
