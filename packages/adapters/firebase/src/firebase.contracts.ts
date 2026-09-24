import { event, Trace } from "@priemskiyyy/trace";
import type { TrackedEvent } from "@priemskiyyy/trace";
import * as NativeAnalytics from "@react-native-firebase/analytics";
import * as FirebaseAnalytics from "firebase/analytics";
import type { Analytics, Item } from "firebase/analytics";
import type { FirebaseApp } from "firebase/app";
import { expectTypeOf } from "vitest";

import { fakeFirebase } from "src/fakeFirebase.fixture";
import { firebase } from "src/firebase";
import { ga4 } from "src/ga4";
import type { FirebaseLike } from "src/types/FirebaseLike";
import type { Ga4Event } from "src/types/Ga4Event";
import type { Ga4Item } from "src/types/Ga4Item";

type Fake = ReturnType<typeof fakeFirebase>;

declare const analytics: Analytics;
declare const nativeAnalytics: NativeAnalytics.Analytics;

export const sdk: FirebaseLike<Analytics> = FirebaseAnalytics;

export const fakeSdk: FirebaseLike<Fake["analytics"]> = fakeFirebase().sdk;

expectTypeOf<keyof Fake["sdk"]>().toExtend<keyof typeof FirebaseAnalytics>();
expectTypeOf<Fake["analytics"]["app"]>().toExtend<
  Pick<FirebaseApp, "name" | "options">
>();

expectTypeOf<Required<Ga4Item>>().toEqualTypeOf<
  Required<Omit<Item, "brand" | "category" | "id" | "name">>
>();

const events = {
  "Checkout Started": event<{
    total: number;
    currency: "EUR" | "USD";
    coupon?: string;
    lines: { sku: string; price: number; quantity: number }[];
  }>(),
  "App Opened": event(),
  "Search Performed": event<{ query: string }>(),
};

export const map = ga4(events, {
  "Checkout Started": ({ properties }) => {
    expectTypeOf(properties.total).toEqualTypeOf<number>();

    return {
      name: "begin_checkout",
      parameters: {
        value: properties.total,
        currency: properties.currency,
        coupon: properties.coupon ?? null,
      },
      items: properties.lines.map(({ sku, price, quantity }) => ({
        item_id: sku,
        price,
        quantity,
      })),
    };
  },
  "App Opened": ({ properties }) => {
    expectTypeOf(properties).toEqualTypeOf<Record<string, never>>();

    return { name: "app_open", parameters: {} };
  },
  "Search Performed": ({ name, properties }) => {
    expectTypeOf(name).toEqualTypeOf<"Search Performed">();

    return { name: "search", parameters: { search_term: properties.query } };
  },
});

expectTypeOf(map).toEqualTypeOf<(event: TrackedEvent) => Ga4Event | null>();

export const trace = new Trace({
  events,
  destinations: {
    product: firebase({ sdk: FirebaseAnalytics, analytics, map }),
  },
});

expectTypeOf(
  trace.destination("product").native,
).toEqualTypeOf<Analytics | null>();

export const app = trace.destination("product").native?.app;

expectTypeOf(app).toEqualTypeOf<FirebaseApp | undefined>();

expectTypeOf<
  Extract<Ga4Event["name"], "begin_checkout" | "purchase" | "login">
>().toEqualTypeOf<"begin_checkout" | "purchase" | "login">();

// @ts-expect-error the map is required.
firebase({ sdk: FirebaseAnalytics, analytics });

// @ts-expect-error an object that is not the Firebase modular API is refused.
firebase({ sdk: { logEvent: () => {} }, analytics, map });

// @ts-expect-error an object that is not a Firebase Analytics instance is refused.
firebase({ sdk: FirebaseAnalytics, analytics: {}, map });

// @ts-expect-error the React Native SDK's user properties take only strings.
firebase({ sdk: NativeAnalytics, analytics: nativeAnalytics, map });

// @ts-expect-error every declared event needs a mapping.
ga4(events, {
  "App Opened": () => null,
  "Search Performed": () => null,
});

ga4(events, {
  "Checkout Started": () => null,
  "App Opened": () => null,
  "Search Performed": () => null,
  // @ts-expect-error an event the registry does not declare cannot be mapped.
  "Checkout Finished": () => null,
});

ga4(events, {
  "Checkout Started": ({ properties }) => ({
    name: "begin_checkout",
    // @ts-expect-error a GA4 parameter is flat.
    parameters: { cart: { lines: properties.lines } },
  }),
  "App Opened": () => null,
  "Search Performed": () => null,
});

ga4(events, {
  "Checkout Started": ({ properties }) => ({
    name: "begin_checkout",
    // @ts-expect-error an absent value is mapped to null or left out, never undefined.
    parameters: { coupon: properties.coupon },
  }),
  "App Opened": () => null,
  "Search Performed": () => null,
});

ga4(events, {
  "Checkout Started": ({ properties }) => ({
    name: "purchase",
    parameters: {},
    // @ts-expect-error an item with none of Firebase's item fields is refused.
    items: properties.lines.map((line) => ({ line })),
  }),
  "App Opened": () => null,
  "Search Performed": () => null,
});

ga4(events, {
  "Checkout Started": () => ({
    name: "purchase",
    parameters: {},
    // @ts-expect-error an item field has the type Firebase gives it.
    items: [{ item_id: 1 }],
  }),
  "App Opened": () => null,
  "Search Performed": () => null,
});

ga4(events, {
  "Checkout Started": () => null,
  // @ts-expect-error a mapping answers { name, parameters } or null.
  "App Opened": () => ({ name: "app_open" }),
  "Search Performed": () => null,
});

ga4(events, {
  "Checkout Started": () => null,
  "App Opened": () => null,
  "Search Performed": ({ properties }) => ({
    name: "search",
    // @ts-expect-error a property the event does not declare is not there.
    parameters: { search_term: properties.term },
  }),
});

export const unchecked = ga4(events, {
  "Checkout Started": ({ properties }) => ({
    name: "purchase",
    parameters: {},
    item: [],
    items: properties.lines.map(({ sku }) => ({
      item_id: sku,
      item_color: "green",
    })),
  }),
  "App Opened": () => null,
  "Search Performed": () => null,
});

ga4(events, {
  "Checkout Started": () =>
    ({
      name: "purchase",
      parameters: {},
      // @ts-expect-error satisfies Ga4Event refuses a field Ga4Event does not have.
      item: [],
    }) satisfies Ga4Event,
  "App Opened": () => null,
  "Search Performed": () => null,
});

ga4(events, {
  "Checkout Started": () =>
    ({
      name: "purchase",
      parameters: {},
      // @ts-expect-error satisfies Ga4Event refuses an item field Firebase does not type, in an item written in the answer.
      items: [{ item_id: "sku_1", item_color: "green" }],
    }) satisfies Ga4Event,
  "App Opened": () => null,
  "Search Performed": () => null,
});

export const builtInCallback = ga4(events, {
  "Checkout Started": ({ properties }) =>
    ({
      name: "purchase",
      parameters: {},
      items: properties.lines.map(({ sku }) => ({
        item_id: sku,
        item_color: "green",
      })),
    }) satisfies Ga4Event,
  "App Opened": () => null,
  "Search Performed": () => null,
});

ga4(events, {
  "Checkout Started": ({ properties }) =>
    ({
      name: "purchase",
      parameters: {},
      items: properties.lines.map(
        ({ sku }) =>
          ({
            item_id: sku,
            // @ts-expect-error satisfies Ga4Item refuses an item field Firebase does not type, in an item a callback builds.
            item_color: "green",
          }) satisfies Ga4Item,
      ),
    }) satisfies Ga4Event,
  "App Opened": () => null,
  "Search Performed": () => null,
});
