import { Trace } from "@priemskiyyy/trace";
import { firebase, ga4 } from "@priemskiyyy/trace-firebase-react-native";
import type {
  Ga4Event,
  Ga4Item,
} from "@priemskiyyy/trace-firebase-react-native";
import { mixpanel } from "@priemskiyyy/trace-mixpanel-react-native";
import { posthog } from "@priemskiyyy/trace-posthog-react-native";
import { segment } from "@priemskiyyy/trace-segment-react-native";
import { getProduct } from "example-shared/boutique/catalog/getProduct";
import { events } from "example-shared/boutique/events";
import type { createSimulatedReactNativeProviders } from "example-shared/simulated/createSimulatedReactNativeProviders";

type BoutiqueTraceOptions = {
  providers: ReturnType<typeof createSimulatedReactNativeProviders>;
};

/**
 * Boutique's reporting surface on React Native, over the four SDKs the app
 * already created. Every event is routed to every destination by default.
 */
export const createBoutiqueTrace = ({ providers }: BoutiqueTraceOptions) =>
  new Trace({
    events,
    destinations: {
      posthog: posthog({ sdk: providers.posthog.sdk }),
      firebase: firebase({
        sdk: providers.firebase.sdk,
        analytics: providers.firebase.analytics,
        map: ga4(events, {
          "Storefront Opened": () => null,
          "Product Viewed": ({ properties }) =>
            ({
              name: "view_item",
              parameters: { currency: "USD", value: properties.product.price },
              items: [
                {
                  item_id: properties.product.id,
                  item_name: properties.product.name,
                  price: properties.product.price,
                } satisfies Ga4Item,
              ],
            }) satisfies Ga4Event,
          "Search Performed": ({ properties }) =>
            ({
              name: "search",
              parameters: { search_term: properties.query },
            }) satisfies Ga4Event,
          "Checkout Started": ({ properties }) =>
            ({
              name: "begin_checkout",
              parameters: {
                value: properties.value,
                currency: properties.currency,
              },
            }) satisfies Ga4Event,
          "Checkout Completed": ({ properties }) =>
            ({
              name: "purchase",
              parameters: {
                value: properties.total,
                currency: properties.currency,
              },
              items: properties.items.map(
                (item) =>
                  ({
                    item_id: item.productId,
                    item_name: getProduct(item.productId).name,
                    quantity: item.quantity,
                  }) satisfies Ga4Item,
              ),
            }) satisfies Ga4Event,
        }),
      }),
      mixpanel: mixpanel({ sdk: providers.mixpanel.sdk }),
      segment: segment({ sdk: providers.segment.sdk }),
    },
    consent: {
      posthog: ["analytics"],
      firebase: ["analytics"],
      mixpanel: ["analytics"],
      segment: ["analytics"],
    },
    timeout: 3_000,
  });
