<script lang="ts">
  import TraceProvider from "../context/TraceProvider.svelte";
  import type { RegisteredTrace } from "../types/Register.js";
  import Call from "./Call.fixture.svelte";

  type Props = {
    trace: RegisteredTrace;
    use: () => unknown;
    watch?: () => unknown;
  };

  const props: Props = $props();
</script>

<TraceProvider trace={props.trace}
  ><Call use={props.use} watch={props.watch} /></TraceProvider
>
