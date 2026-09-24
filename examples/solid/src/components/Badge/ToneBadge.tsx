import type { ParentComponent } from "solid-js";

import { badgeStyles } from "example-shared/ui/styles/badgeStyles";
import type { Tone } from "example-shared/ui/types/Tone";

type ToneBadgeProps = { tone: Tone };

export const ToneBadge: ParentComponent<ToneBadgeProps> = (props) => (
  <span class={badgeStyles({ tone: props.tone })}>{props.children}</span>
);
