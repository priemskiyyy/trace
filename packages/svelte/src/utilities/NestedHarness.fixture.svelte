<script lang="ts">
  import TraceProvider from "../context/TraceProvider.svelte";
  import type { RegisteredTrace } from "../types/Register.js";
  import Call from "./Call.fixture.svelte";

  type Props = {
    outer: RegisteredTrace;
    inner: RegisteredTrace;
    use: () => unknown;
  };

  const props: Props = $props();
</script>

<TraceProvider trace={props.outer}>
  <TraceProvider trace={props.inner}><Call use={props.use} /></TraceProvider>
</TraceProvider>
