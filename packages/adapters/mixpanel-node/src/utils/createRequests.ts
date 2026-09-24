import { TraceError } from "@priemskiyyy/trace";
import type { FlushResult } from "@priemskiyyy/trace";

type Call = (callback: (error: Error | undefined) => void) => void;

const start = (call: Call) =>
  new Promise<void>((resolve, reject) => {
    call((error) => {
      if (error === undefined) {
        resolve();

        return;
      }

      reject(error);
    });
  });

export const createRequests = () => {
  const pending = new Set<Promise<void>>();
  let queued = Promise.resolve();
  let refused = 0;

  const watch = (request: Promise<void>) => {
    pending.add(request);
    request.then(
      () => {
        pending.delete(request);
      },
      () => {
        pending.delete(request);
        refused += 1;
      },
    );

    return request;
  };

  return {
    send: (call: Call) => watch(start(call)),
    queue: (call: Call) => {
      queued = watch(queued.then(() => start(call))).catch(() => {});
    },
    flush: () =>
      Promise.allSettled(pending).then((): FlushResult => {
        const count = refused;

        refused = 0;

        if (count === 0) {
          return { status: "flushed" };
        }

        return {
          status: "failed",
          error: new TraceError({
            code: "DELIVERY_FAILED",
            message: `Mixpanel did not accept ${count} of the requests sent since the last flush.`,
          }),
        };
      }),
  };
};
