import { Plugs } from "@phosphor-icons/react";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-react";
import type React from "react";

import { assertUnreachable } from "example-shared/utils/assertUnreachable";
import { DestinationCard } from "src/components/Lab/DestinationCard";
import { Panel } from "src/components/Panel/Panel";
import { useEventLog } from "src/hooks/useEventLog";
import type { BoutiqueRuntime } from "src/types/BoutiqueRuntime";
import { DESTINATION_NAMES } from "src/utils/constants/destinations";

type DestinationsPanelProps = { runtime: BoutiqueRuntime };

export const DestinationsPanel: React.FunctionComponent<
  DestinationsPanelProps
> = ({ runtime }) => {
  const amplitudeInbox = useEventLog(runtime.providers.amplitude.inbox);
  const posthogInbox = useEventLog(runtime.providers.posthog.inbox);
  const mixpanelInbox = useEventLog(runtime.providers.mixpanel.inbox);
  const gtagInbox = useEventLog(runtime.providers.gtag.inbox);
  const segmentInbox = useEventLog(runtime.providers.segment.inbox);
  const requests = useEventLog(runtime.backend.requests);

  const getLastReceived = (name: RegisteredDestinationName) => {
    if (name === "amplitude") {
      return amplitudeInbox[0]?.eventName ?? null;
    }

    if (name === "posthog") {
      return posthogInbox[0]?.eventName ?? null;
    }

    if (name === "mixpanel") {
      return mixpanelInbox[0]?.eventName ?? null;
    }

    if (name === "googleAnalytics") {
      return gtagInbox[0]?.eventName ?? null;
    }

    if (name === "segment") {
      return segmentInbox[0]?.eventName ?? null;
    }

    if (name === "backend") {
      const accepted = requests.find(
        (request) => request.outcome === "accepted",
      );

      return accepted?.orderId ?? null;
    }

    return assertUnreachable(name);
  };

  return (
    <Panel
      title="Destinations"
      icon={Plugs}
      shows="Every destination is a real Trace adapter. The SDKs and the backend behind them are simulated in the page."
    >
      <ul
        aria-label="Destinations"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {DESTINATION_NAMES.map((name) => (
          <DestinationCard
            key={name}
            name={name}
            lastReceived={getLastReceived(name)}
          />
        ))}
      </ul>
    </Panel>
  );
};
