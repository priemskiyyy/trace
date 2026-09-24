import { createSignal, onCleanup } from "solid-js";

const FEEDBACK_DURATION = 1_200;

export const useClipboard = () => {
  const [hasCopied, setHasCopied] = createSignal(false);

  let timer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => clearTimeout(timer));

  const copy = (text: string) => {
    const { clipboard } = navigator;

    // An insecure origin has no clipboard, so copying does nothing there.
    if (clipboard === undefined) {
      return;
    }

    clipboard.writeText(text).then(
      () => {
        setHasCopied(true);
        clearTimeout(timer);
        timer = setTimeout(() => setHasCopied(false), FEEDBACK_DURATION);
      },
      () => {},
    );
  };

  return { hasCopied, copy };
};
