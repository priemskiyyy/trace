import type { FlushResult } from "@priemskiyyy/trace";

import type { SegmentLike } from "src/types/SegmentLike";

export const createFlush = (sdk: SegmentLike) => {
  let pending: Promise<FlushResult> | null = null;

  // analytics-node answers a flush that overlaps a running one at once, before anything was sent.
  return () => {
    if (pending === null) {
      pending = sdk
        .flush()
        .then((): FlushResult => ({ status: "flushed" }))
        .finally(() => {
          pending = null;
        });
    }

    return pending;
  };
};
