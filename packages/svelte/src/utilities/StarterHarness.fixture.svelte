<script lang="ts">
  import TraceProvider from "../context/TraceProvider.svelte";
  import type { RegisteredTrace } from "../types/Register.js";
  import Call from "./Call.fixture.svelte";
  import Starter from "./Starter.fixture.svelte";

  const props: { trace: RegisteredTrace; use: () => unknown } = $props();
</script>

<TraceProvider trace={props.trace}
  ><Starter /><Call use={props.use} /></TraceProvider
>
