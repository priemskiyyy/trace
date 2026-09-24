<script lang="ts">
  import TraceProvider from "../context/TraceProvider.svelte";
  import type { RegisteredTrace } from "../types/Register.js";
  import Named from "./Named.fixture.svelte";

  type Props = { trace: RegisteredTrace; name: string; count: number };

  const props: Props = $props();
</script>

<TraceProvider trace={props.trace}
  ><Named name={props.name} count={props.count} /></TraceProvider
>
