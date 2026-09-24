<script lang="ts">
  import { useTraceStatus } from "@priemskiyyy/trace-svelte";
  import { dotStyles } from "example-shared/ui/styles/dotStyles";
  import ToneBadge from "src/components/Badge/ToneBadge.svelte";
  import { TRACE_STATUS_LABELS } from "src/utils/constants/labels";
  import { TRACE_STATUS_TONES } from "src/utils/constants/tones";

  const status = useTraceStatus();
  const tone = $derived(TRACE_STATUS_TONES[status.current.state]);
</script>

<ToneBadge {tone}>
  <span aria-hidden="true" class={dotStyles({ tone })}></span>
  {TRACE_STATUS_LABELS[status.current.state]}
</ToneBadge>
