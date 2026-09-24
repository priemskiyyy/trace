import {
  ArrowClockwise,
  Flask,
  Funnel,
  Power,
  WifiSlash,
} from "@phosphor-icons/react";
import clsx from "clsx";
import type React from "react";

import type { OrdersBackend } from "example-shared/backend/types/OrdersBackend";
import type { BoutiqueRuntime } from "example-shared/boutique/reporting/types/BoutiqueRuntime";
import { LATENCY_OPTIONS } from "example-shared/lab/constants/latencyOptions";
import type { SimulatedProviders } from "example-shared/simulated/types/SimulatedProviders";
import { CARD_CLASS_NAME } from "example-shared/ui/styles/cardStyles";
import { LabControl } from "src/components/Lab/LabControl";
import { LabField } from "src/components/Lab/LabField";
import { SegmentedControl } from "src/components/SegmentedControl/SegmentedControl";
import { useObservable } from "src/hooks/useObservable";

type LabPanelProps = {
  backend: OrdersBackend;
  providers: SimulatedProviders;
  runtime: BoutiqueRuntime;
  onRestartPress: () => void;
};

export const LabPanel: React.FunctionComponent<LabPanelProps> = ({
  backend,
  providers,
  runtime,
  onRestartPress,
}) => {
  const state = useObservable(backend.state);
  const filtering = useObservable(providers.posthog.filtering);
  const segmentReady = useObservable(providers.segment.ready);

  const handleSegmentPress = () => {
    if (!segmentReady) {
      providers.segment.setReady(true);

      return;
    }

    providers.segment.setReady(false);
    onRestartPress();
  };

  const handleRetryStartPress = () => {
    runtime.trace.start();
  };

  return (
    <section
      aria-label="Lab"
      className={clsx(
        "flex h-full min-w-0 flex-col gap-5 border-dashed p-5",
        CARD_CLASS_NAME,
      )}
    >
      <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">
        <Flask
          aria-hidden="true"
          size={18}
          weight="duotone"
          className="text-violet-600 dark:text-violet-400"
        />
        Lab
      </h3>
      <LabField label="Your API's latency">
        <SegmentedControl
          label="Your API's latency"
          options={LATENCY_OPTIONS}
          value={state.latency}
          onSelect={backend.setLatency}
        />
      </LabField>
      <ul className="grid gap-3 sm:grid-cols-2">
        <LabControl
          icon={WifiSlash}
          label="Your API offline"
          description="Your API answers 503. Only its outcome fails; the other five destinations still get the event."
          pressed={state.offline}
          onPress={() => backend.setOffline(!state.offline)}
        />
        <LabControl
          icon={Funnel}
          label="PostHog filters everything"
          description="PostHog's own filters drop each event and its SDK says so, so its outcome is Dropped, not Submitted."
          pressed={filtering}
          onPress={() => providers.posthog.filtering.set(!filtering)}
        />
        <LabControl
          icon={Power}
          label="Segment never loads"
          description="Restarts Trace while Segment is still loading, so its start fails and its events wait in the buffer. Turn it back on, then retry the start."
          pressed={!segmentReady}
          onPress={handleSegmentPress}
        />
        <LabControl
          icon={ArrowClockwise}
          label="Retry start"
          description="Calls trace.start() again, which retries only the destinations that are not ready yet."
          pressed={false}
          onPress={handleRetryStartPress}
        />
      </ul>
    </section>
  );
};
