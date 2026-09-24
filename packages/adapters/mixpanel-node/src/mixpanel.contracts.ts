import { event, Trace } from "@priemskiyyy/trace";
import type Mixpanel from "mixpanel";
import type { OverridedMixpanel } from "mixpanel-browser";
import type { Mixpanel as ReactNativeMixpanel } from "mixpanel-react-native";
import { expectTypeOf } from "vitest";

import type { fakeMixpanel } from "src/fakeMixpanel.fixture";
import { mixpanel } from "src/mixpanel";
import type { MixpanelLike } from "src/types/MixpanelLike";

type Client = Mixpanel.Mixpanel;

type FakeSdk = ReturnType<typeof fakeMixpanel>["sdk"];

declare const client: Client;
declare const browserMixpanel: OverridedMixpanel;
declare const reactNativeMixpanel: ReactNativeMixpanel;
declare const track: Parameters<FakeSdk["track"]>;
declare const peopleSet: Parameters<FakeSdk["people"]["set"]>;
declare const peopleUnset: Parameters<FakeSdk["people"]["unset"]>;
declare const groupsSet: Parameters<FakeSdk["groups"]["set"]>;
declare const groupsUnset: Parameters<FakeSdk["groups"]["unset"]>;
declare const init: Parameters<FakeSdk["init"]>;

declare const drifted: [
  name: string,
  properties: string,
  callback: (error: Error | undefined) => void,
];

export const sdk: MixpanelLike = client;

expectTypeOf<FakeSdk>().toExtend<MixpanelLike>();
expectTypeOf<keyof FakeSdk>().toExtend<keyof Client>();
expectTypeOf<keyof FakeSdk["people"]>().toExtend<keyof Client["people"]>();
expectTypeOf<keyof FakeSdk["groups"]>().toExtend<keyof Client["groups"]>();

// The real client's members are overloaded, so the fake's parameters are pinned by spreading them into its calls.
client.track(...track);
client.people.set(...peopleSet);
client.people.unset(...peopleUnset);
client.groups.set(...groupsSet);
client.groups.unset(...groupsUnset);
client.init(...init);

// @ts-expect-error A fake parameter the real client does not take is refused, so a fake that drifts fails here.
client.track(...drifted);

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: {
    product: mixpanel({ sdk: client, anonymousId: "visitor-7" }),
  },
});

expectTypeOf(
  trace.destination("product").native,
).toEqualTypeOf<Client | null>();

export const trackBatch = trace.destination("product").native?.track_batch;

mixpanel({
  // @ts-expect-error An object that is not the mixpanel Node client is refused.
  sdk: { track: () => {} },
});

mixpanel({
  // @ts-expect-error mixpanel-browser holds a user between calls; it has its own package.
  sdk: browserMixpanel,
});

mixpanel({
  // @ts-expect-error The React Native SDK has its own package.
  sdk: reactNativeMixpanel,
});

mixpanel({
  sdk: client,
  // @ts-expect-error The anonymous id is the visitor's id itself, not a function that finds it.
  anonymousId: () => "visitor-7",
});
