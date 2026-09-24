<script lang="ts">
  import { untrack } from "svelte";
  import { createDevtools } from "src/svelte";
  import type { TraceDevtoolsProps } from "src/types/TraceDevtoolsProps";

  type Props = { options?: TraceDevtoolsProps | undefined };

  const props: Props = $props();

  // Read once on purpose: an attachment is created with its options, or with none.
  const devtools = createDevtools(untrack(() => props.options));
</script>

<div {@attach devtools}></div>
