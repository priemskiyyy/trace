import { event } from "@priemskiyyy/trace";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";
import { afterEach } from "vitest";

import { fakeGtag } from "src/fakeGtag.fixture";
import { ga4 } from "src/ga4";
import { googleAnalytics } from "src/googleAnalytics";

const MEASUREMENT = { id: "G-TRACE12345" };

const events = {
  "Conformance Checked": event<{
    cart: { id: string; items: { sku: string; quantity: number }[] };
    value: number;
  }>(),
};

const map = ga4(events, {
  "Conformance Checked": ({ properties }) => ({
    name: "begin_checkout",
    parameters: { value: properties.value, cart_id: properties.cart.id },
    items: properties.cart.items.map(({ sku, quantity }) => ({
      item_id: sku,
      quantity,
    })),
  }),
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, `ga-disable-${MEASUREMENT.id}`);
});

testAnalyticsAdapter({
  name: "google-analytics",
  createAdapter: () =>
    googleAnalytics({ sdk: fakeGtag().sdk, measurement: MEASUREMENT, map }),
});
