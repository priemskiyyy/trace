<script lang="ts">
  import { useTraceStatus } from "@priemskiyyy/trace-svelte";
  import { TRACE_STATUS_LABELS } from "example-shared/boutique/reporting/constants/labels";
  import { TRACE_STATUS_TONES } from "example-shared/ui/constants/tones";
  import { dotStyles } from "example-shared/ui/styles/dotStyles";
  import ToneBadge from "src/components/Badge/ToneBadge.svelte";

  const status = useTraceStatus();
  const tone = $derived(TRACE_STATUS_TONES[status.current.state]);
</script>

<ToneBadge {tone}>
  <span aria-hidden="true" class={dotStyles({ tone })}></span>
  {TRACE_STATUS_LABELS[status.current.state]}
</ToneBadge>
