import { CopyButton } from "src/components/Timeline/CopyButton";
import { EventDetail } from "src/components/Timeline/EventDetail";
import { formatEventDate } from "src/formatting/formatEventDate";
import { formatEventId } from "src/formatting/formatEventId";
import { formatEventTime } from "src/formatting/formatEventTime";
import type { RecordedEvent } from "src/types/internal/RecordedEvent";
import { assertUnreachable } from "src/utils/assertUnreachable";

type EventRowProps = {
  event: RecordedEvent;
};

export const EventRow = (props: EventRowProps) => {
  const date = () => formatEventDate(props.event.timestamp);

  return (
    <details
      class="event"
      data-kind={props.event.kind}
      data-row={props.event.row}
    >
      <summary>
        <time dateTime={date()} title={date()}>
          {formatEventTime(props.event.timestamp)}
        </time>
        <span class="event-type">{props.event.type}</span>
        <span class="event-destination">
          {props.event.destination?.name ?? props.event.source}
        </span>
        <span class="event-id" title={props.event.event?.id}>
          {formatEventId(props.event.event)}
        </span>
        <span class="event-summary" title={props.event.summary}>
          {props.event.summary}
        </span>
        <svg
          class="expand"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
        >
          <path
            d="M2 3.5 5 6.5 8 3.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
      </summary>
      {(() => {
        const event = props.event;

        if (event.row === "DIAGNOSTIC") {
          return (
            <div class="context">
              <pre>{event.context}</pre>
              <CopyButton text={event.context} />
            </div>
          );
        }

        if (event.row === "ACCEPTED") {
          return <EventDetail event={event} />;
        }

        return assertUnreachable(event);
      })()}
    </details>
  );
};
