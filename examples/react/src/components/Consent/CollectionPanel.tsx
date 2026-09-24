import { ToggleLeft } from "@phosphor-icons/react";
import type React from "react";

import { Badge } from "src/components/Badge/Badge";
import { Panel } from "src/components/Panel/Panel";
import { useObservable } from "src/hooks/useObservable";
import type { BoutiqueRuntime } from "src/types/BoutiqueRuntime";

type CollectionPanelProps = { runtime: BoutiqueRuntime };

export const CollectionPanel: React.FunctionComponent<CollectionPanelProps> = ({
  runtime,
}) => {
  const amplitudeOptedOut = useObservable(runtime.providers.amplitude.optedOut);
  const posthogCollecting = useObservable(runtime.providers.posthog.collecting);

  const mixpanelCollecting = useObservable(
    runtime.providers.mixpanel.collecting,
  );

  const rows = [
    { name: "Amplitude", collecting: !amplitudeOptedOut },
    { name: "PostHog", collecting: posthogCollecting },
    { name: "Mixpanel", collecting: mixpanelCollecting },
  ];

  return (
    <Panel
      title="Collection, on the SDKs themselves"
      icon={ToggleLeft}
      shows="The same consent decision reaches each provider through its own switch. Google Analytics and Segment have none of their own; Trace gates them at the door instead."
    >
      <ul
        aria-label="Collection"
        className="flex flex-col divide-y divide-zinc-200/70 text-sm dark:divide-zinc-800"
      >
        {rows.map((row) => (
          <li
            key={row.name}
            aria-label={row.name}
            className="flex items-center justify-between py-2"
          >
            <span>{row.name}</span>
            <Badge tone={row.collecting ? "positive" : "neutral"}>
              {row.collecting ? "Collecting" : "Opted out"}
            </Badge>
          </li>
        ))}
      </ul>
    </Panel>
  );
};
