<script lang="ts">
  import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
  import StatusBadge from "src/components/Badge/StatusBadge.svelte";
  import ToneBadge from "src/components/Badge/ToneBadge.svelte";

  const handleResetClick = () => {
    window.location.reload();
  };
</script>

<header
  class="sticky top-0 z-20 border-b border-zinc-200/70 bg-zinc-50/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70"
>
  <div
    class="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6"
  >
    <h1 class="text-lg font-semibold">Boutique</h1>
    <StatusBadge />
    <ToneBadge tone="neutral">Svelte</ToneBadge>
    <button
      type="button"
      class="ml-auto {buttonStyles({ variant: 'ghost', size: 'small' })}"
      onclick={handleResetClick}
    >
      Reset demo
    </button>
  </div>
</header>
