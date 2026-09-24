/**
 * The part of a posthog-node client the adapter calls. A `PostHog` from
 * `posthog-node` satisfies it, so this package imports no SDK: the application
 * passes in the client it constructed.
 *
 * @example
 * ```ts
 * import { PostHog } from "posthog-node";
 *
 * const sdk: PostHogLike = new PostHog("phc_project_api_key");
 * ```
 */
export type PostHogLike = {
  /** Queues the event for the distinct id on the call; without one, posthog-node would take an enclosing `withContext` id or record the event without a person. */
  capture: (message: {
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
    groups: Record<string, string>;
    timestamp: Date;
    uuid: string;
  }) => void;
  /** Queues an `$identify` for the distinct id, which merges the person of `$anon_distinct_id` into it. */
  identify: (message: {
    distinctId: string;
    properties: { $anon_distinct_id: string };
  }) => void;
  /** Queues a `$set` for the distinct id, and nothing when `properties` is empty. */
  setPersonProperties: (message: {
    distinctId: string;
    properties: Record<string, unknown>;
  }) => void;
  /** Queues an `$unset` for the distinct id without the blank names, and nothing when none is left. */
  unsetPersonProperties: (message: {
    distinctId: string;
    properties: string[];
  }) => void;
  /** Queues a `$groupidentify` with the group's properties under the distinct id. */
  groupIdentify: (message: {
    groupType: string;
    groupKey: string;
    properties: Record<string, unknown>;
    distinctId: string;
  }) => void;
  /** Sends what the client holds once any flush in flight has ended, resolves once PostHog answered 2xx for the batches it sent, and rejects with the first error. */
  flush: () => Promise<void>;
};
