import type { FlushContext } from "src/types/FlushContext";
import type { FlushResult } from "src/types/FlushResult";

/**
 * One `flush` a mock session recorded, and the controls a test answers it with
 * while `flush` is `"hold"`.
 *
 * @example
 * ```ts
 * mock.sessions[0]?.flushes[0]?.settle({ status: "timeout" });
 * ```
 */
export type MockFlush = {
  context: FlushContext;
  /** Answers the held flush: `flushed` unless told otherwise. */
  settle: (result?: FlushResult) => void;
  /** Rejects the held flush with the error. */
  fail: (error: unknown) => void;
};
