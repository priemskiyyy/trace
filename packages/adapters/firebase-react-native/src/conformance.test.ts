import { event } from "@priemskiyyy/trace";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { fakeFirebase } from "src/fakeFirebase.fixture";
import { firebase } from "src/firebase";
import { ga4 } from "src/ga4";

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

testAnalyticsAdapter({
  name: "firebase-react-native",
  createAdapter: () => {
    const { sdk, analytics } = fakeFirebase();

    return firebase({ sdk, analytics, map });
  },
});
