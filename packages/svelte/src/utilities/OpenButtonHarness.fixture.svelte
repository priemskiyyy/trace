<script lang="ts">
  import TraceProvider from "../context/TraceProvider.svelte";
  import type { RegisteredTrace } from "../types/Register.js";
  import OpenButton from "./OpenButton.fixture.svelte";

  const props: { trace: RegisteredTrace } = $props();
</script>

<TraceProvider trace={props.trace}><OpenButton /></TraceProvider>
