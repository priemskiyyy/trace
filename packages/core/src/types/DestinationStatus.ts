/**
 * Where one destination stands. `ready` means its session opened, not that a
 * network or a backend is reachable, and `failed` holds what its `open` threw
 * until `start()` tries again.
 *
 * @example
 * ```ts
 * const status: DestinationStatus = trace.destination("product").status.get();
 * ```
 */
export type DestinationStatus =
  | { state: "idle" }
  | { state: "ready" }
  | { state: "failed"; error: unknown }
  | { state: "disposed" };
