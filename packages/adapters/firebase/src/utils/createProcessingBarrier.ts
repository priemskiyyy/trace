import { TraceError } from "@priemskiyyy/trace";

type Change = {
  apply: () => void;
  resolve: () => void;
  reject: (error: unknown) => void;
};

export const createProcessingBarrier = () => {
  let pending = 0;
  let waiting: Change | null = null;

  const cancel = () => {
    const withdrawn = waiting;

    waiting = null;
    withdrawn?.reject(
      new TraceError({
        code: "DELIVERY_FAILED",
        message:
          "The identity change was withdrawn before Firebase had processed the events ahead of it, so it never reached Firebase.",
      }),
    );
  };

  return {
    begin: () => {
      let processed = false;

      pending += 1;

      return () => {
        if (processed) {
          return;
        }

        processed = true;
        pending -= 1;

        const released = waiting;

        if (pending > 0 || released === null) {
          return;
        }

        waiting = null;

        try {
          released.apply();
          released.resolve();
        } catch (error) {
          released.reject(error);
        }
      };
    },
    run: (apply: () => void) => {
      cancel();

      if (pending === 0) {
        apply();

        return undefined;
      }

      return new Promise<void>((resolve, reject) => {
        waiting = { apply, resolve, reject };
      });
    },
    cancel,
  };
};
