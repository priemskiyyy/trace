<script lang="ts">
  type Props = { title: string; description: string };

  let { title, description }: Props = $props();
</script>

<div
  class="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center dark:border-zinc-700"
>
  <p class="text-base font-medium">{title}</p>
  <p class="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
    {description}
  </p>
</div>
