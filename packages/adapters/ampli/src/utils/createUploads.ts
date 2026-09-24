import { TraceError } from "@priemskiyyy/trace";
import type { FlushResult } from "@priemskiyyy/trace";

type Upload = Promise<{ code: number } | void>;

export const createUploads = () => {
  const pending = new Set<Upload>();
  let refused = 0;
  let reported = 0;

  return {
    add: (upload: Upload) => {
      pending.add(upload);
      upload.then(
        (result) => {
          pending.delete(upload);

          if (result === undefined || result.code < 200 || result.code >= 300) {
            refused += 1;
          }
        },
        () => {
          pending.delete(upload);
          refused += 1;
        },
      );
    },
    flush: (flushed: Promise<unknown>, signal: AbortSignal) => {
      const since = reported;

      return Promise.all([flushed, Promise.allSettled(pending)]).then(
        (): FlushResult => {
          const count = refused - since;

          if (!signal.aborted) {
            reported = refused;
          }

          if (count === 0) {
            return { status: "flushed" };
          }

          return {
            status: "failed",
            error: new TraceError({
              code: "DELIVERY_FAILED",
              message: `Amplitude did not accept ${count} of this destination's uploads since the last flush.`,
            }),
          };
        },
      );
    },
  };
};
