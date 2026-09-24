import { event, Trace } from "@priemskiyyy/trace";
import mixpanelBrowser from "mixpanel-browser";
import type { Mixpanel, People } from "mixpanel-react-native";
import { expectTypeOf } from "vitest";

import { fakeMixpanel } from "src/fakeMixpanel.fixture";
import { mixpanel } from "src/mixpanel";
import type { MixpanelLike } from "src/types/MixpanelLike";

type FakeSdk = ReturnType<typeof fakeMixpanel>["sdk"];

type FakePeople = ReturnType<FakeSdk["getPeople"]>;

declare const client: Mixpanel;
declare const identifiesAtOnce: Omit<MixpanelLike, "identify"> & {
  identify: (id: string) => void;
};

export const sdk: MixpanelLike = client;

export const fakeSdk: MixpanelLike = fakeMixpanel().sdk;

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: { product: mixpanel({ sdk: client }) },
});

expectTypeOf(
  trace.destination("product").native,
).toEqualTypeOf<Mixpanel | null>();

export const getDistinctId = trace.destination("product").native?.getDistinctId;

expectTypeOf(getDistinctId).toEqualTypeOf<
  (() => Promise<string>) | undefined
>();

expectTypeOf<keyof FakeSdk>().toExtend<keyof Mixpanel>();
expectTypeOf<keyof FakePeople>().toExtend<keyof People>();
expectTypeOf<FakeSdk["init"]>().toExtend<Mixpanel["init"]>();
expectTypeOf<FakeSdk["track"]>().toExtend<Mixpanel["track"]>();
expectTypeOf<FakeSdk["identify"]>().toExtend<Mixpanel["identify"]>();
expectTypeOf<FakeSdk["setGroup"]>().toExtend<Mixpanel["setGroup"]>();
expectTypeOf<FakeSdk["unregisterSuperProperty"]>().toExtend<
  Mixpanel["unregisterSuperProperty"]
>();
expectTypeOf<FakeSdk["reset"]>().toExtend<Mixpanel["reset"]>();
expectTypeOf<FakeSdk["optInTracking"]>().toExtend<Mixpanel["optInTracking"]>();
expectTypeOf<FakeSdk["optOutTracking"]>().toExtend<
  Mixpanel["optOutTracking"]
>();
expectTypeOf<FakeSdk["flush"]>().toExtend<Mixpanel["flush"]>();
expectTypeOf<FakePeople["set"]>().toExtend<
  (properties: Parameters<People["set"]>[0]) => void
>();
expectTypeOf<FakePeople["unset"]>().toExtend<People["unset"]>();

// @ts-expect-error an object that is not a mixpanel-react-native instance is refused.
mixpanel({ sdk: { track: () => undefined } });

// @ts-expect-error identify answers a promise, which Trace waits for.
mixpanel({ sdk: identifiesAtOnce });

// @ts-expect-error the browser SDK has its own package.
mixpanel({ sdk: mixpanelBrowser });
