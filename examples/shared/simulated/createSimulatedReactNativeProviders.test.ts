import { afterEach, expect, test, vi } from "vitest";

import { createSimulatedReactNativeProviders } from "example-shared/simulated/createSimulatedReactNativeProviders";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a runtime without crypto, such as Hermes, still records every call with an id of its own", async () => {
  vi.stubGlobal("crypto", undefined);

  const { firebase, mixpanel } = createSimulatedReactNativeProviders();

  mixpanel.sdk.track("Storefront Opened", {});
  mixpanel.sdk.track("Search Performed", { query: "boots" });
  await firebase.analytics.logEvent("Storefront Opened", {});
  await firebase.analytics.logEvent("Search Performed", { query: "boots" });

  const ids = [
    ...mixpanel.inbox.getSnapshot(),
    ...firebase.inbox.getSnapshot(),
  ].map((call) => call.id);

  expect(new Set(ids).size).toBe(4);
});
