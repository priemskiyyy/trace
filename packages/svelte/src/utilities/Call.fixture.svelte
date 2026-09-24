<script lang="ts">
  import { untrack } from "svelte";

  type Props = { use: () => unknown; watch?: (() => unknown) | undefined };

  const props: Props = $props();

  // Called once on purpose, while the component is created, as a utility must be.
  untrack(() => props.use());

  $effect(() => {
    props.watch?.();
  });
</script>
