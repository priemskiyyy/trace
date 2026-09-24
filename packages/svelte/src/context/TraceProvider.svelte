<!--
@component Publishes one Trace to the components below and does nothing else:
whoever constructed it starts and disposes it, so mounting opens nothing and
unmounting disposes nothing. Augment `Register` first, or TypeScript refuses a
Trace typed by its own events.
@example `<TraceProvider {trace}><Application /></TraceProvider>`
-->
<script lang="ts">
  import { setContext } from "svelte";
  import type { ReadableValue } from "../types/ReadableValue.js";
  import type { RegisteredTrace } from "../types/Register.js";
  import type { TraceProviderProps } from "../types/TraceProviderProps.js";
  import { TRACE_CONTEXT } from "./TraceContext.js";

  const props: TraceProviderProps = $props();

  setContext(TRACE_CONTEXT, {
    get current() {
      return props.trace;
    },
  } satisfies ReadableValue<RegisteredTrace>);
</script>

{#if props.children}
  {@render props.children()}
{/if}
