import { For, Show } from "solid-js";

import type { ContextLoss } from "src/types/internal/ContextLoss";

type LossListProps = {
  losses: ContextLoss[];
};

export const LossList = (props: LossListProps) => (
  <Show when={props.losses.length > 0}>
    <ul class="losses">
      <For each={props.losses}>
        {(loss) => (
          <li>
            <code>{loss.path}</code> {loss.reason}
          </li>
        )}
      </For>
    </ul>
  </Show>
);
