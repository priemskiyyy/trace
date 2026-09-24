import {
  ArrowClockwise,
  Flask,
  Funnel,
  Power,
  WifiSlash,
} from "@phosphor-icons/react";
import { useTrace } from "@priemskiyyy/trace-react";
import clsx from "clsx";
import type React from "react";

import { LATENCY_OPTIONS } from "example-shared/lab/constants/latencyOptions";
import { CARD_CLASS_NAME } from "example-shared/ui/styles/cardStyles";
import { LabControl } from "src/components/Lab/LabControl";
import { LabField } from "src/components/Lab/LabField";
import { SegmentedControl } from "src/components/SegmentedControl/SegmentedControl";
import { useObservable } from "src/hooks/useObservable";
import type { BoutiqueRuntime } from "src/types/BoutiqueRuntime";

type LabPanelProps = { runtime: BoutiqueRuntime };

export const LabPanel: React.FunctionComponent<LabPanelProps> = ({
  runtime,
}) => {
  const trace = useTrace();
  const state = useObservable(runtime.backend.state);
  const filtering = useObservable(runtime.providers.posthog.filtering);
  const segmentReady = useObservable(runtime.providers.segment.ready);

  const handleRetryStartPress = () => {
    trace.start();
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
          onSelect={runtime.backend.setLatency}
        />
      </LabField>
      <ul className="grid gap-3 sm:grid-cols-2">
        <LabControl
          icon={WifiSlash}
          label="Your API offline"
          description="Your API answers 503. Its outcome fails, and every other destination still gets the event."
          pressed={state.offline}
          onPress={() => runtime.backend.setOffline(!state.offline)}
        />
        <LabControl
          icon={Funnel}
          label="PostHog filters everything"
          description="PostHog's own filters drop each event, which its SDK says, so the outcome is dropped, not submitted."
          pressed={filtering}
          onPress={() => runtime.providers.posthog.filtering.set(!filtering)}
        />
        <LabControl
          icon={Power}
          label="Segment not initialized"
          description="Segment starts this way, as a load that never finished: its events wait in the buffer. Turn it on, then Retry start."
          pressed={!segmentReady}
          onPress={() => runtime.providers.segment.setReady(!segmentReady)}
        />
        <LabControl
          icon={ArrowClockwise}
          label="Retry start"
          description="Calls trace.start() again. It only retries the destinations that are not ready yet."
          pressed={false}
          onPress={handleRetryStartPress}
        />
      </ul>
    </section>
  );
};
