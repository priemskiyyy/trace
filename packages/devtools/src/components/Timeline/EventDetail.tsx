import { For, Show, createMemo } from "solid-js";

import { CopyButton } from "src/components/Timeline/CopyButton";
import { LossList } from "src/components/Timeline/LossList";
import { useTimeline } from "src/components/Timeline/useTimeline";
import { formatOutcome } from "src/formatting/formatOutcome";
import type { RecordedEvent } from "src/types/internal/RecordedEvent";
import { getEventDelivery } from "src/utils/getEventDelivery";

type EventDetailProps = {
  event: Extract<RecordedEvent, { row: "ACCEPTED" }>;
};

export const EventDetail = (props: EventDetailProps) => {
  const timeline = useTimeline();

  const delivery = createMemo(() =>
    getEventDelivery(timeline.events(), props.event),
  );

  return (
    <dl class="detail">
      <dt>Outcomes</dt>
      <dd>
        <Show
          when={delivery().outcomes.length > 0}
          fallback={<span class="muted">No outcome recorded</span>}
        >
          <ul class="outcomes">
            <For each={delivery().outcomes}>
              {(outcome) => (
                <li class="outcome" data-status={outcome.status}>
                  <span class="outcome-line">{formatOutcome(outcome)}</span>
                  <LossList losses={outcome.losses} />
                </li>
              )}
            </For>
          </ul>
        </Show>
      </dd>
      <dt>Losses</dt>
      <dd class="accepted-losses">
        <Show
          when={delivery().losses.length > 0}
          fallback={<span class="muted">None at acceptance</span>}
        >
          <LossList losses={delivery().losses} />
        </Show>
      </dd>
      <dt>Identity</dt>
      <dd class="identity">{props.event.summary}</dd>
      <dt>Values</dt>
      <dd class="values">
        <Show
          when={timeline.showValues()}
          fallback={
            <span class="muted">
              Hidden. Turn on Show values to see the properties, context, traits
              and groups.
            </span>
          }
        >
          <div class="context">
            <pre>{props.event.values}</pre>
            <CopyButton text={props.event.values} />
          </div>
        </Show>
      </dd>
    </dl>
  );
};
