import { event, Trace } from "@priemskiyyy/trace";
import mixpanelBrowser from "mixpanel-browser";
import type {
  Callback,
  Config,
  Dict,
  Group,
  Mixpanel,
  OverridedMixpanel,
  People,
} from "mixpanel-browser";
import type { Mixpanel as MixpanelReactNative } from "mixpanel-react-native";
import { expectTypeOf } from "vitest";

import type { fakeMixpanel } from "src/fakeMixpanel.fixture";
import { mixpanel } from "src/mixpanel";
import type { MixpanelLike } from "src/types/MixpanelLike";

type FakeSdk = ReturnType<typeof fakeMixpanel>["sdk"];

type FakeGroup = ReturnType<FakeSdk["get_group"]>;

declare const named: Mixpanel;
declare const client: MixpanelReactNative;

export const sdk: MixpanelLike = mixpanelBrowser;

export const namedSdk: MixpanelLike = named;

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: { product: mixpanel({ sdk: mixpanelBrowser }) },
});

expectTypeOf(
  trace.destination("product").native,
).toEqualTypeOf<OverridedMixpanel | null>();

export const getDistinctId =
  trace.destination("product").native?.get_distinct_id;

expectTypeOf<FakeSdk["track"]>().toExtend<Mixpanel["track"]>();
expectTypeOf<FakeSdk["identify"]>().toExtend<Mixpanel["identify"]>();
expectTypeOf<FakeSdk["register"]>().toExtend<Mixpanel["register"]>();
expectTypeOf<FakeSdk["unregister"]>().toExtend<Mixpanel["unregister"]>();
expectTypeOf<FakeSdk["set_group"]>().toExtend<Mixpanel["set_group"]>();
expectTypeOf<FakeSdk["remove_group"]>().toExtend<Mixpanel["remove_group"]>();
expectTypeOf<FakeSdk["reset"]>().toExtend<Mixpanel["reset"]>();
expectTypeOf<FakeSdk["set_config"]>().toExtend<Mixpanel["set_config"]>();
expectTypeOf<FakeSdk["opt_out_tracking"]>().toExtend<
  Mixpanel["opt_out_tracking"]
>();
expectTypeOf<FakeSdk["opt_in_tracking"]>().toExtend<
  Mixpanel["opt_in_tracking"]
>();
expectTypeOf<FakeSdk["people"]["set"]>().toExtend<
  (prop: Dict, callback?: Callback) => void
>();
expectTypeOf<FakeSdk["people"]["unset"]>().toExtend<People["unset"]>();
expectTypeOf<Parameters<FakeSdk["get_group"]>>().toEqualTypeOf<
  Parameters<Mixpanel["get_group"]>
>();
expectTypeOf<FakeGroup["set"]>().toExtend<(prop: Dict) => unknown>();
expectTypeOf<FakeGroup["unset"]>().toExtend<Group["unset"]>();
expectTypeOf<FakeSdk["init"]>().toExtend<
  (token: string, config?: Partial<Config>) => undefined
>();

// @ts-expect-error mixpanel-browser sets __loaded in init but leaves it out of its types, so MixpanelLike marks it optional.
expectTypeOf<Mixpanel>().toHaveProperty("__loaded");

// @ts-expect-error The fake models only the object form of people.set, the one the adapter calls.
expectTypeOf<FakeSdk["people"]["set"]>().toExtend<People["set"]>();

// @ts-expect-error mixpanel-browser types Group.set as answering the group, though 2.83.0 answers what it sends; the adapter reads neither.
expectTypeOf<FakeGroup["set"]>().toExtend<Group["set"]>();

// @ts-expect-error The fake models the default instance's init, which answers undefined; a named init answers a new instance.
expectTypeOf<FakeSdk["init"]>().toExtend<OverridedMixpanel["init"]>();

// @ts-expect-error An object that is not mixpanel-browser is refused.
mixpanel({ sdk: { track: () => undefined } });

// @ts-expect-error The React Native SDK has its own package.
mixpanel({ sdk: client });
