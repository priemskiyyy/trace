import { fireEvent, waitFor, within } from "@testing-library/dom";
import { createApp } from "vue";
import { afterEach, expect, test } from "vitest";

import { startBoutique } from "example-shared/boutique/reporting/startBoutique";
import type { BoutiqueRuntime } from "example-shared/boutique/reporting/types/BoutiqueRuntime";
import Application from "src/Application.vue";

const runtimes: BoutiqueRuntime[] = [];
const disposals: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposals.splice(0)) {
    dispose();
  }

  for (const runtime of runtimes.splice(0)) {
    runtime.dispose();
  }
});

const renderApplication = () => {
  const { backend, providers, runtime } = startBoutique({ latency: 0 });

  runtimes.push(runtime);

  const root = document.createElement("div");
  const application = createApp(Application, { runtime });

  document.body.append(root);
  application.mount(root);
  disposals.push(() => {
    application.unmount();
    root.remove();
  });

  return { backend, providers, runtime, app: within(root) };
};

const press = (app: ReturnType<typeof within>, name: string) => {
  fireEvent.click(app.getByRole("button", { name }));
};

const product = (app: ReturnType<typeof within>, name: string) =>
  within(app.getByRole("listitem", { name }));

const latestReceipt = (app: ReturnType<typeof within>) =>
  app.getByRole("region", { name: "Latest receipt" });

const readOutcome = (app: ReturnType<typeof within>, destination: string) =>
  within(latestReceipt(app)).getByRole("listitem", { name: destination })
    .textContent;

const waitForSettled = (app: ReturnType<typeof within>) =>
  waitFor(() => {
    expect(within(latestReceipt(app)).getByText("Settled")).toBeTruthy();
  });

test("Boutique opens with an empty cart and nothing tracked yet", () => {
  const { app } = renderApplication();

  expect(app.getByText("Your cart is empty")).toBeTruthy();
  expect(
    within(latestReceipt(app)).getByText("Nothing tracked yet"),
  ).toBeTruthy();
});

test("checking out reaches every destination with the same accepted event", async () => {
  const { app, backend, providers } = renderApplication();

  press(app, "Accept");
  fireEvent.click(
    product(app, "Suede Boots").getByRole("button", { name: "Add to cart" }),
  );
  press(app, "Check out");

  await waitForSettled(app);

  expect(providers.amplitude.inbox.getSnapshot()[0]).toMatchObject({
    eventName: "Checkout Completed",
    body: { total: 128 },
  });
  expect(providers.posthog.inbox.getSnapshot()[0]).toMatchObject({
    eventName: "Checkout Completed",
    body: { total: 128 },
  });
  expect(providers.mixpanel.inbox.getSnapshot()[0]).toMatchObject({
    eventName: "Checkout Completed",
    body: { total: 128 },
  });
  expect(providers.segment.inbox.getSnapshot()[0]).toMatchObject({
    eventName: "Checkout Completed",
    body: { total: 128 },
  });
  expect(providers.gtag.inbox.getSnapshot()[0]).toMatchObject({
    eventName: "purchase",
    body: { value: 128 },
  });
  expect(backend.requests.getSnapshot()[0]).toMatchObject({
    outcome: "accepted",
  });
  expect(readOutcome(app, "Amplitude")).toContain("Submitted");
  expect(readOutcome(app, "PostHog")).toContain("Submitted");
  expect(readOutcome(app, "Mixpanel")).toContain("Submitted");
  expect(readOutcome(app, "Google Analytics")).toContain("Submitted");
  expect(readOutcome(app, "Segment")).toContain("Submitted");
  expect(readOutcome(app, "Your API")).toContain("Submitted");
});

test("a redacted card token never reaches any destination, and the receipt says so", async () => {
  const { app, providers } = renderApplication();

  press(app, "Accept");
  fireEvent.click(
    product(app, "Silk Scarf").getByRole("button", { name: "Add to cart" }),
  );
  press(app, "Check out");

  await waitForSettled(app);

  expect(providers.amplitude.inbox.getSnapshot()[0]?.body).not.toHaveProperty(
    "payment.card.token",
  );
  expect(
    within(latestReceipt(app)).getAllByText(
      "properties.payment.card.token: redacted",
    ).length,
  ).toBeGreaterThan(0);
});

test("while consent is unknown only your own API receives events, and accepting opens the rest", async () => {
  const { app, providers } = renderApplication();

  fireEvent.click(
    product(app, "Silk Scarf").getByRole("button", { name: "Add to cart" }),
  );
  press(app, "Check out");
  await waitForSettled(app);

  expect(readOutcome(app, "Amplitude")).toContain("Not routed");
  expect(readOutcome(app, "Your API")).toContain("Submitted");
  expect(providers.amplitude.inbox.getSnapshot()).toHaveLength(0);

  press(app, "Accept");
  fireEvent.click(
    product(app, "Silk Scarf").getByRole("button", { name: "Add to cart" }),
  );
  press(app, "Check out");
  await waitForSettled(app);

  expect(readOutcome(app, "Amplitude")).toContain("Submitted");
});
