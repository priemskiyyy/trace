import { onMount } from "solid-js";

export const useAutoFocus = (enabled: boolean) => {
  let element: HTMLElement | undefined;

  onMount(() => {
    if (!enabled) {
      return;
    }

    element?.focus();
  });

  return (node: HTMLElement) => {
    element = node;
  };
};
