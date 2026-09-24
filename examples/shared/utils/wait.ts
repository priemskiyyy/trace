/** Resolves after `ms`, or rejects at once when `signal` is already aborted or aborts meanwhile. */
export const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);

      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };

    signal.addEventListener("abort", handleAbort, { once: true });
  });
