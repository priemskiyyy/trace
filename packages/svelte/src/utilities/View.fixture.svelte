<script lang="ts">
  import type {
    ConsentDecision,
    DestinationStatus,
    TraceStatus,
  } from "@priemskiyyy/trace";
  import { untrack } from "svelte";
  import { useConsent } from "./useConsent.js";
  import { useDestinationStatus } from "./useDestinationStatus.js";
  import { useTraceStatus } from "./useTraceStatus.js";

  type Props = {
    onStatus?: ((status: TraceStatus) => void) | undefined;
    onDestination?: ((status: DestinationStatus) => void) | undefined;
    onConsent?:
      ((decisions: Record<string, ConsentDecision>) => void) | undefined;
  };

  const props: Props = $props();

  // Read once on purpose: a utility is created with its callback, or with none.
  const status = useTraceStatus(untrack(() => props.onStatus));

  const destination = useDestinationStatus(
    "product",
    untrack(() => props.onDestination),
  );

  const consent = useConsent(untrack(() => props.onConsent));
</script>

<span
  >{status.current.state}/{destination.current.state}/{consent.current
    .analytics}/{consent.current.advertising}</span
>
