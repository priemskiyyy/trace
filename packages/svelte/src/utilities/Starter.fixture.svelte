<script lang="ts">
  import { onMount } from "svelte";
  import { useTrace } from "./useTrace.js";

  const trace = useTrace();

  onMount(() => {
    trace.current.start();
  });
</script>
