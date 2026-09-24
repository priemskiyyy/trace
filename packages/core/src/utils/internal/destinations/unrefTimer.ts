export const unrefTimer = (timer: ReturnType<typeof setTimeout>) => {
  // Browsers and React Native hand out numeric timer ids, with nothing to unref.
  if (typeof timer.unref !== "function") {
    return;
  }

  timer.unref();
};
