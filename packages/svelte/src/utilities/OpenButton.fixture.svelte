<script lang="ts">
  import { useTrace } from "./useTrace.js";

  const trace = useTrace();

  const handleOpenClick = () => {
    trace.current.track("App Opened");
  };
</script>

<button type="button" onclick={handleOpenClick}>Open</button>
