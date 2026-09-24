import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter, TrackResult } from "@priemskiyyy/trace";

import type { MixpanelAdapterOptions } from "src/types/MixpanelAdapterOptions";
import type { MixpanelLike } from "src/types/MixpanelLike";
import { applyIdentify } from "src/utils/applyIdentify";
import { OPT_IN_OPTIONS, OPT_OUT_OPTIONS } from "src/utils/constants/consent";
import {
  MAX_EVENT_AGE,
  MAX_EVENT_SIZE,
  MAX_NAME_LENGTH,
  MAX_STRING_LENGTH,
} from "src/utils/constants/limits";
import {
  RESERVED_GROUP_PROPERTIES,
  RESERVED_PROFILE_PROPERTIES,
} from "src/utils/constants/properties";
import { getMixpanelProperties } from "src/utils/getMixpanelProperties";
import { getProfileUpdate } from "src/utils/getProfileUpdate";
import { getSentSize } from "src/utils/getSentSize";
import { isOwnedName } from "src/utils/isOwnedName";

/**
 * Sends each event to Mixpanel as one `track` call, with its time, its id as
 * `$insert_id` and its context under its properties, through the
 * mixpanel-browser instance the application initialized. The user, their
 * traits and their groups become Mixpanel's own identify, profile and group
 * calls.
 *
 * @example
 * ```ts
 * import { event, Trace } from "@priemskiyyy/trace";
 * import { mixpanel } from "@priemskiyyy/trace-mixpanel";
 * import mixpanelBrowser from "mixpanel-browser";
 *
 * mixpanelBrowser.init("YOUR_PROJECT_TOKEN", { opt_out_tracking_by_default: true });
 *
 * const trace = new Trace({
 *   events: { "App Opened": event() },
 *   destinations: { product: mixpanel({ sdk: mixpanelBrowser }) },
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
  name: "mixpanel",
  open: () => {
    // Before init every mixpanel-browser method throws, so only this flag is read.
    if (sdk.__loaded !== true) {
      throw new TraceError({
        code: "NOT_INITIALIZED",
        message:
          "Mixpanel is not initialized. Call mixpanel.init before trace.start().",
      });
    }

    return {
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

        const answer = sdk.track(event.name, properties);

        // Opt-out, Do Not Track, bots, disable() and a before_track answering undefined give nothing; a dropped immediate request gives null.
        if (answer === undefined || answer === null) {
          return { status: "dropped", reason: "provider-filtered", losses };
        }

        if (answer === false) {
          return {
            status: "failed",
            error: new TraceError({
              code: "DELIVERY_FAILED",
              message: "Mixpanel could not start the request for this event.",
            }),
          };
        }

        return { status: "submitted", evidence: "sdk-call-returned", losses };
      },
      identify: ({ user }) => applyIdentify(sdk, user.id),
      traits: ({ user, set, remove }) => {
        // Profile updates wait in Mixpanel's queue until identify runs in this page load.
        if (user !== null) {
          applyIdentify(sdk, user.id);
        }

        const update = getProfileUpdate({ set, remove }, (name) =>
          RESERVED_PROFILE_PROPERTIES.includes(name),
        );

        if (Object.keys(update.set).length > 0) {
          sdk.people.set(update.set);
        }

        if (update.remove.length > 0) {
          sdk.people.unset(update.remove);
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
        // set_group registers the type as a super property, so an owned name would overwrite Mixpanel's own.
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

        // remove_group would leave a stray group_key super property on every later event.
        if (id === null || id.length > MAX_STRING_LENGTH) {
          sdk.unregister(type);
          sdk.people.unset([type]);

          if (id === null) {
            return;
          }

          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Mixpanel would cut this group's id past 255 characters, so the membership was left out and any earlier group of this type was left.",
          });
        }

        sdk.set_group(type, id);

        const set: Record<string, unknown> = {};
        const remove: string[] = [];

        for (const [key, value] of Object.entries(traits)) {
          if (value === null) {
            remove.push(key);

            continue;
          }

          set[key] = value;
        }

        const update = getProfileUpdate({ set, remove }, (name) =>
          RESERVED_GROUP_PROPERTIES.includes(name),
        );

        const hasSet = Object.keys(update.set).length > 0;

        if (hasSet || update.remove.length > 0) {
          const profile = sdk.get_group(type, id);

          if (hasSet) {
            profile.set(update.set);
          }

          for (const key of update.remove) {
            profile.unset(key);
          }
        }

        if (!update.isComplete) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Mixpanel cannot keep every group property in this update; the others were set.",
          });
        }
      },
      reset: () => sdk.reset(),
      collection: (enabled) => {
        if (enabled) {
          sdk.opt_in_tracking(OPT_IN_OPTIONS);

          return;
        }

        sdk.opt_out_tracking(OPT_OUT_OPTIONS);
      },
    };
  },
});
