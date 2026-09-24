<script lang="ts">
  import type { RegisteredTrace } from "@priemskiyyy/trace-svelte";
  import { TraceProvider } from "@priemskiyyy/trace-svelte";
  import Host from "src/svelteHost.fixture.svelte";
  import type { TraceDevtoolsProps } from "src/types/TraceDevtoolsProps";

  type Props = {
    trace: RegisteredTrace;
    options?: TraceDevtoolsProps | undefined;
  };

  const props: Props = $props();
</script>

<TraceProvider trace={props.trace}>
  <Host options={props.options} />
</TraceProvider>
