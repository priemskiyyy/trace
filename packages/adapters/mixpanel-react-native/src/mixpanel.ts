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
import { getMixpanelProperties } from "src/utils/getMixpanelProperties";
import { getProfileUpdate } from "src/utils/getProfileUpdate";
import { getSentSize } from "src/utils/getSentSize";
import { isOwnedName } from "src/utils/isOwnedName";

/**
 * Sends each event to Mixpanel as one `track` call, with its time, its id as
 * `$insert_id` and its context under its properties, through the
 * mixpanel-react-native instance the application initialized. The user,
 * their traits and their group memberships become Mixpanel's own identify,
 * profile and group calls.
 *
 * @example
 * ```ts
 * import { event, Trace } from "@priemskiyyy/trace";
 * import { mixpanel } from "@priemskiyyy/trace-mixpanel-react-native";
 * import { Mixpanel } from "mixpanel-react-native";
 *
 * const client = new Mixpanel("YOUR_PROJECT_TOKEN", false);
 *
 * await client.init();
 *
 * const trace = new Trace({
 *   events: { "App Opened": event() },
 *   destinations: { product: mixpanel({ sdk: client }) },
 *   consent: { product: ["analytics"] },
 * });
 *
 * trace.consent.set({ analytics: "granted" });
 * trace.start();
 * ```
 */
export const mixpanel = <TSdk extends MixpanelLike>({
  sdk,
}: MixpanelAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "mixpanel-react-native",
  open: () => ({
    native: sdk,
    track: (event, { now }): TrackResult => {
      if (now() - event.timestamp > MAX_EVENT_AGE) {
        return {
          status: "dropped",
          reason: "provider-filtered",
          losses: [{ path: "timestamp", reason: "unsupported" }],
        };
      }

      const { properties, losses } = getMixpanelProperties(event);

      if (getSentSize({ event: event.name, properties }) >= MAX_EVENT_SIZE) {
        return {
          status: "dropped",
          reason: "provider-filtered",
          losses: [...losses, { path: "properties", reason: "invalid" }],
        };
      }

      sdk.track(event.name, properties);

      return { status: "submitted", evidence: "sdk-call-returned", losses };
    },
    identify: ({ user }) => {
      if (user.id.length > MAX_STRING_LENGTH) {
        throw new TraceError({
          code: "DELIVERY_FAILED",
          message: `Mixpanel keeps the first ${MAX_STRING_LENGTH} characters of a distinct id, so this user would share an identity with any id that starts the same.`,
        });
      }

      return sdk.identify(user.id);
    },
    traits: ({ set, remove }) => {
      const update = getProfileUpdate({ set, remove });

      if (Object.keys(update.set).length > 0) {
        sdk.getPeople().set(update.set);
      }

      for (const name of update.remove) {
        sdk.getPeople().unset(name);
      }

      if (!update.isComplete) {
        throw new TraceError({
          code: "UNSUPPORTED",
          message:
            "Mixpanel cannot keep every profile property in this update; the others were set.",
        });
      }
    },
    group: ({ group: { type, id, traits } }) => {
      // setGroup registers the type as a super property, so an owned name would overwrite Mixpanel's own.
      if (isOwnedName(type)) {
        throw new TraceError({
          code: "UNSUPPORTED",
          message:
            "Mixpanel owns this name, so it cannot be a group type: joining or leaving would change Mixpanel's own property on every later event.",
        });
      }

      if (type.length > MAX_NAME_LENGTH) {
        throw new TraceError({
          code: "UNSUPPORTED",
          message:
            "Mixpanel would cut this group's type past 255 characters, so the membership was left out.",
        });
      }

      // removeGroup needs the id being left, which a leave does not carry.
      if (id === null || id.length > MAX_STRING_LENGTH) {
        sdk.unregisterSuperProperty(type);
        sdk.getPeople().unset(type);

        if (id === null) {
          return;
        }

        throw new TraceError({
          code: "UNSUPPORTED",
          message:
            "Mixpanel would cut this group's id past 255 characters, so the membership was left out and any earlier group of this type was left.",
        });
      }

      sdk.setGroup(type, id);

      if (Object.keys(traits).length > 0) {
        throw new TraceError({
          code: "UNSUPPORTED",
          message:
            "mixpanel-react-native cannot set a group's own properties: its getGroup answers the first group it created for every later one.",
        });
      }
    },
    reset: () => sdk.reset(),
  }),
});
