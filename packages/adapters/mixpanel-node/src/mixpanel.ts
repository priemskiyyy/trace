import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter, TrackResult } from "@priemskiyyy/trace";

import type { MixpanelAdapterOptions } from "src/types/MixpanelAdapterOptions";
import type { MixpanelLike } from "src/types/MixpanelLike";
import {
  MAX_EVENT_AGE,
  MAX_EVENT_SIZE,
  MAX_NAME_LENGTH,
  MAX_STRING_LENGTH,
} from "src/utils/constants/limits";
import { createRequests } from "src/utils/createRequests";
import { getMixpanelProperties } from "src/utils/getMixpanelProperties";
import { getProfileUpdate } from "src/utils/getProfileUpdate";
import { getSentSize } from "src/utils/getSentSize";
import { isOwnedName } from "src/utils/isOwnedName";

/**
 * Sends each event to Mixpanel as one request for its user and the visitor's
 * anonymous id, with its time and its id as `$insert_id`, through the mixpanel
 * Node client the application created, and answers once Mixpanel accepted it.
 * Traits and groups become profile and group updates for the user each update
 * names.
 *
 * @example
 * ```ts
 * import Mixpanel from "mixpanel";
 *
 * const client = Mixpanel.init("YOUR_PROJECT_TOKEN");
 *
 * const trace = new Trace({
 *   events,
 *   destinations: { product: mixpanel({ sdk: client, anonymousId: visitorId }) },
 * });
 * ```
 */
export const mixpanel = <TSdk extends MixpanelLike>({
  sdk,
  anonymousId,
}: MixpanelAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "mixpanel-node",
  open: () => {
    const requests = createRequests();

    return {
      native: sdk,
      track: (event, { now }) => {
        if (event.identity.user === null && anonymousId === undefined) {
          return { status: "skipped", reason: "unidentified" };
        }

        if (
          event.identity.user !== null &&
          event.identity.user.id.length > MAX_STRING_LENGTH
        ) {
          return {
            status: "failed",
            error: new TraceError({
              code: "DELIVERY_FAILED",
              message: `Mixpanel keeps the first ${MAX_STRING_LENGTH} characters of a distinct id, so this user would share an identity with any id that starts the same.`,
            }),
          };
        }

        if (
          anonymousId !== undefined &&
          anonymousId.length > MAX_STRING_LENGTH
        ) {
          return {
            status: "failed",
            error: new TraceError({
              code: "DELIVERY_FAILED",
              message: `Mixpanel keeps the first ${MAX_STRING_LENGTH} characters of a distinct id, so this visitor would share an identity with any id that starts the same.`,
            }),
          };
        }

        if (now() - event.timestamp > MAX_EVENT_AGE) {
          return {
            status: "dropped",
            reason: "provider-filtered",
            losses: [{ path: "timestamp", reason: "unsupported" }],
          };
        }

        // The client writes its token into the object it is given, so it gets one of its own.
        const { properties, losses } = getMixpanelProperties(
          event,
          anonymousId,
        );

        if (getSentSize({ event: event.name, properties }) >= MAX_EVENT_SIZE) {
          return {
            status: "dropped",
            reason: "provider-filtered",
            losses: [...losses, { path: "properties", reason: "invalid" }],
          };
        }

        return requests
          .send((callback) => {
            sdk.track(event.name, properties, callback);
          })
          .then((): TrackResult => ({
            status: "submitted",
            evidence: "backend-acknowledged",
            losses,
          }));
      },
      traits: ({ user, set, remove }) => {
        if (user === null) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Mixpanel keeps traits on a user's profile, and this update has no user.",
          });
        }

        if (user.id.length > MAX_STRING_LENGTH) {
          throw new TraceError({
            code: "DELIVERY_FAILED",
            message: `Mixpanel keeps the first ${MAX_STRING_LENGTH} characters of a distinct id, so this user would share an identity with any id that starts the same.`,
          });
        }

        const update = getProfileUpdate({
          ...Object.fromEntries(remove.map((key) => [key, null])),
          ...set,
        });

        if (Object.keys(update.set).length > 0) {
          requests.queue((callback) => {
            sdk.people.set(user.id, update.set, callback);
          });
        }

        if (update.remove.length > 0) {
          requests.queue((callback) => {
            sdk.people.unset(user.id, update.remove, callback);
          });
        }

        if (!update.isComplete) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Mixpanel cannot keep every trait in this update as it is; the others are sent.",
          });
        }
      },
      group: ({ user, group: { type, id, traits } }) => {
        if (isOwnedName(type)) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Mixpanel owns this name, so it cannot be a group type: the membership would overwrite Mixpanel's own property on the user's profile.",
          });
        }

        if (type.length > MAX_NAME_LENGTH) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Mixpanel would cut this group's type past 255 characters, so the membership was left out.",
          });
        }

        if (id === null || id.length > MAX_STRING_LENGTH) {
          if (user !== null) {
            requests.queue((callback) => {
              sdk.people.unset(user.id, [type], callback);
            });
          }

          if (id === null) {
            return;
          }

          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Mixpanel would cut this group's id past 255 characters, so the membership was left out and any earlier group of this type was left.",
          });
        }

        const update = getProfileUpdate(traits);

        if (Object.keys(update.set).length > 0) {
          requests.queue((callback) => {
            sdk.groups.set(type, id, update.set, callback);
          });
        }

        if (update.remove.length > 0) {
          requests.queue((callback) => {
            sdk.groups.unset(type, id, update.remove, callback);
          });
        }

        if (user === null) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Mixpanel keeps a membership on a user's profile, and this update has no user; the group's own properties are sent.",
          });
        }

        const membership = getProfileUpdate({ [type]: [id] });

        if (membership.isComplete) {
          requests.queue((callback) => {
            sdk.people.set(user.id, membership.set, callback);
          });
        }

        if (!update.isComplete || !membership.isComplete) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Mixpanel cannot keep every part of this group update as it is; the rest is sent.",
          });
        }
      },
      flush: requests.flush,
    };
  },
});
