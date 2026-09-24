import type { TraceErrorCode } from "src/types/TraceErrorCode";

/**
 * An error Trace or an adapter created, with a `code` to branch on. What a
 * provider SDK throws reaches a receipt or a status as it was thrown, never
 * wrapped in one of these.
 *
 * @example
 * ```ts
 * const status = trace.destination("product").status.get();
 *
 * if (status.state === "failed" && status.error instanceof TraceError) {
 *   console.warn(status.error.code, status.error.message);
 * }
 * ```
 */
export class TraceError extends Error {
  code: TraceErrorCode;

  constructor({
    code,
    message,
    cause,
  }: {
    code: TraceErrorCode;
    message: string;
    cause?: unknown;
  }) {
    // `{ cause: undefined }` would still give the error a `cause` of its own.
    super(message, cause === undefined ? undefined : { cause });
    this.name = "TraceError";
    this.code = code;
  }
}
