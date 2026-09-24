import { TraceError } from "@priemskiyyy/trace";
import type { FlushResult } from "@priemskiyyy/trace";

export const getFlushResult = (
  flushed: Promise<unknown>,
  uploads: Promise<{ code: number } | void>[],
) =>
  Promise.all([flushed, ...uploads]).then(([, ...results]): FlushResult => {
    const refused = results.filter(
      (result) =>
        result === undefined || result.code < 200 || result.code >= 300,
    ).length;

    if (refused === 0) {
      return { status: "flushed" };
    }

    return {
      status: "failed",
      error: new TraceError({
        code: "DELIVERY_FAILED",
        message: `Amplitude did not accept ${refused} of the uploads this flush waited for.`,
      }),
    };
  });
