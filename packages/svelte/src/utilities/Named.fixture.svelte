<script lang="ts">
  import { useConsent } from "./useConsent.js";
  import { useDestinationStatus } from "./useDestinationStatus.js";
  import { useTrace } from "./useTrace.js";
  import { useTraceStatus } from "./useTraceStatus.js";

  const props: { name: string; count: number } = $props();

  useTrace();
  useTraceStatus();

  const destination = useDestinationStatus(() => props.name);

  useConsent();
</script>

<span>{destination.current.state}/{props.count}</span>
