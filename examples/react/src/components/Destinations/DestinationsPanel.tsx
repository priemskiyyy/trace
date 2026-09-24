import { Plugs } from "@phosphor-icons/react";
import { useConsent } from "@priemskiyyy/trace-react";
import type React from "react";
import { match } from "ts-pattern";

import type { OrdersBackend } from "example-shared/backend/types/OrdersBackend";
import { DESTINATION_NAMES } from "example-shared/boutique/reporting/constants/destinations";
import { MEASUREMENT_DISABLE_FLAG } from "example-shared/boutique/reporting/constants/googleAnalytics";
import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import type { CollectionState } from "example-shared/boutique/reporting/types/CollectionState";
import { CREW_IDS, CREWS } from "example-shared/boutique/users/constants/crews";
import type { SimulatedProviders } from "example-shared/simulated/types/SimulatedProviders";
import { DestinationCard } from "src/components/Destinations/DestinationCard";
import { Panel } from "src/components/Panel/Panel";
import { useEventLog } from "src/hooks/useEventLog";
import { useObservable } from "src/hooks/useObservable";

type DestinationsPanelProps = {
  backend: OrdersBackend;
  providers: SimulatedProviders;
};

const getCollection = (collecting: boolean): CollectionState =>
  collecting ? "collecting" : "off";

export const DestinationsPanel: React.FunctionComponent<
  DestinationsPanelProps
> = ({ backend, providers }) => {
  const { analytics } = useConsent();
  const amplitudeInbox = useEventLog(providers.amplitude.inbox);
  const posthogInbox = useEventLog(providers.posthog.inbox);
  const mixpanelInbox = useEventLog(providers.mixpanel.inbox);
  const gtagInbox = useEventLog(providers.gtag.inbox);
  const segmentInbox = useEventLog(providers.segment.inbox);
  const requests = useEventLog(backend.requests);
  const amplitudeOptedOut = useObservable(providers.amplitude.optedOut);
  const posthogCollecting = useObservable(providers.posthog.collecting);
  const mixpanelCollecting = useObservable(providers.mixpanel.collecting);
  const segmentGroup = useObservable(providers.segment.group);

  // gtag keeps its switch on window, so a consent change is what re-reads it.
  const gtagDisabled: unknown = Reflect.get(
    globalThis,
    MEASUREMENT_DISABLE_FLAG,
  );

  const getLastReceived = (name: BoutiqueDestination) =>
    match(name)
      .with("amplitude", () => amplitudeInbox[0]?.eventName ?? null)
      .with("posthog", () => posthogInbox[0]?.eventName ?? null)
      .with("mixpanel", () => mixpanelInbox[0]?.eventName ?? null)
      .with("googleAnalytics", () => gtagInbox[0]?.eventName ?? null)
      .with("segment", () => segmentInbox[0]?.eventName ?? null)
      .with(
        "backend",
        () =>
          requests.find((request) => request.outcome === "accepted")?.event
            .name ?? null,
      )
      .exhaustive();

  const getOwnSwitch = (name: BoutiqueDestination) =>
    match(name)
      .with("amplitude", () => getCollection(!amplitudeOptedOut))
      .with("posthog", () => getCollection(posthogCollecting))
      .with("mixpanel", () => getCollection(mixpanelCollecting))
      .with("googleAnalytics", () => getCollection(gtagDisabled !== true))
      .with("segment", (): CollectionState => "none")
      .with("backend", () => null)
      .exhaustive();

  const getGroup = (name: BoutiqueDestination) =>
    match(name)
      .with("segment", () => {
        const crew = CREW_IDS.find((id) => id === segmentGroup);

        return crew === undefined ? "None" : CREWS[crew].name;
      })
      .otherwise(() => null);

  return (
    <Panel
      title="Destinations"
      icon={Plugs}
      shows="Every destination is a real Trace adapter over a simulated SDK or backend, with what consent does to it right now."
    >
      <ul
        aria-label="Destinations"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {DESTINATION_NAMES.map((name) => (
          <DestinationCard
            key={name}
            name={name}
            consent={analytics}
            collection={getOwnSwitch(name)}
            group={getGroup(name)}
            lastReceived={getLastReceived(name)}
          />
        ))}
      </ul>
    </Panel>
  );
};
