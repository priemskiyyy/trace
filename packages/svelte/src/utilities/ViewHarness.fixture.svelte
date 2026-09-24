<script lang="ts">
  import type {
    ConsentDecision,
    DestinationStatus,
    TraceStatus,
  } from "@priemskiyyy/trace";
  import TraceProvider from "../context/TraceProvider.svelte";
  import type { RegisteredTrace } from "../types/Register.js";
  import View from "./View.fixture.svelte";

  type Props = {
    trace: RegisteredTrace;
    onStatus?: ((status: TraceStatus) => void) | undefined;
    onDestination?: ((status: DestinationStatus) => void) | undefined;
    onConsent?:
      ((decisions: Record<string, ConsentDecision>) => void) | undefined;
  };

  const props: Props = $props();
</script>

<TraceProvider trace={props.trace}
  ><View
    onStatus={props.onStatus}
    onDestination={props.onDestination}
    onConsent={props.onConsent}
  /></TraceProvider
>
