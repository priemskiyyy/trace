<script lang="ts">
  import { createDevtools } from "@priemskiyyy/trace-devtools/svelte";

  const devtools = createDevtools();
</script>

<div {@attach devtools}></div>
