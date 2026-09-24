import { Trace } from "@priemskiyyy/trace";
import { amplitude, identityPlugin } from "@priemskiyyy/trace-amplitude";
import { ga4, googleAnalytics } from "@priemskiyyy/trace-google-analytics";
import type { Ga4Event, Ga4Item } from "@priemskiyyy/trace-google-analytics";
import { http } from "@priemskiyyy/trace-http";
import { mixpanel } from "@priemskiyyy/trace-mixpanel";
import { posthog } from "@priemskiyyy/trace-posthog";
import { segment } from "@priemskiyyy/trace-segment";
import { getProduct } from "example-shared/boutique/catalog/getProduct";
import { events } from "example-shared/boutique/events";
import type { createOrdersBackend } from "example-shared/backend/createOrdersBackend";
import type { createSimulatedProviders } from "example-shared/simulated/createSimulatedProviders";
import { z } from "zod";

type BoutiqueTraceOptions = {
  backend: ReturnType<typeof createOrdersBackend>;
  providers: ReturnType<typeof createSimulatedProviders>;
};

const MEASUREMENT_ID = "G-BOUTIQUE1";

/**
 * Boutique's whole reporting surface, over the SDKs and the backend the page
 * already created. Every event is routed to every destination by default.
 */
export const createBoutiqueTrace = ({
  backend,
  providers,
}: BoutiqueTraceOptions) => {
  const plugin = identityPlugin();

  providers.amplitude.addPlugin(plugin);

  return new Trace({
    events,
    destinations: {
      amplitude: amplitude({
        sdk: providers.amplitude.sdk,
        Identify: providers.amplitude.Identify,
        plugin,
      }),
      posthog: posthog({ sdk: providers.posthog.sdk }),
      mixpanel: mixpanel({ sdk: providers.mixpanel.sdk }),
      googleAnalytics: googleAnalytics({
        sdk: providers.gtag.sdk,
        measurement: { id: MEASUREMENT_ID },
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
      segment: segment({ sdk: providers.segment.sdk, group: { type: "crew" } }),
      backend: http({ request: backend.request }),
    },
    schema: {
      traits: { plan: z.enum(["member", "vip"]) },
      groups: { crew: { size: z.number() } },
    },
    consent: {
      amplitude: ["analytics"],
      posthog: ["analytics"],
      mixpanel: ["analytics"],
      googleAnalytics: ["analytics"],
      segment: ["analytics"],
    },
    timeout: 3_000,
  });
};
