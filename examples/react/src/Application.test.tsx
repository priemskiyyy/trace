import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { startBoutique } from "example-shared/boutique/reporting/startBoutique";
import type { BoutiqueRuntime } from "example-shared/boutique/reporting/types/BoutiqueRuntime";
import { Application } from "src/Application";

class IntersectionObserverStub {
  observe() {}

  disconnect() {}
}

const runtimes: BoutiqueRuntime[] = [];

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
});

afterEach(() => {
  cleanup();

  for (const runtime of runtimes.splice(0)) {
    runtime.dispose();
  }

  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const renderApplication = () => {
  const { backend, providers, runtime } = startBoutique({ latency: 0 });

  runtimes.push(runtime);
  render(
    <Application backend={backend} providers={providers} runtime={runtime} />,
  );

  return { backend, providers, runtime };
};

const press = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
};

const isPressed = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed") === "true";

const product = (name: string) =>
  within(
    within(screen.getByRole("list", { name: "Products" })).getByRole(
      "listitem",
      { name },
    ),
  );

const addToCart = (name: string) => {
  fireEvent.click(product(name).getByRole("button", { name: "Add to cart" }));
};

const readLatestReceipt = () =>
  screen.getByRole("region", { name: "Latest receipt" });

const readOutcome = (destination: string) =>
  within(readLatestReceipt()).getByRole("listitem", { name: destination })
    .textContent;

const readCard = (destination: string) =>
  within(
    within(screen.getByRole("list", { name: "Destinations" })).getByRole(
      "listitem",
      { name: destination },
    ),
  );

const waitForSettled = () =>
  waitFor(() => {
    expect(within(readLatestReceipt()).getByText("Settled")).toBeTruthy();
  });

test("Boutique opens signed out, with an empty cart, nothing tracked yet and the consent question open", () => {
  renderApplication();

  expect(isPressed("Signed out")).toBe(true);
  expect(isPressed("No crew")).toBe(true);
  expect(screen.getByText("Your cart is empty")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
  expect(
    within(readLatestReceipt()).getByText("Nothing tracked yet"),
  ).toBeTruthy();
});

test("checking out reaches every destination with the same accepted event", async () => {
  const { backend, providers } = renderApplication();

  press("Accept");
  addToCart("Suede Boots");
  press("Check out");

  await waitForSettled();

  for (const inbox of [
    providers.amplitude.inbox,
    providers.posthog.inbox,
    providers.mixpanel.inbox,
    providers.segment.inbox,
  ]) {
    expect(inbox.getSnapshot()[0]).toMatchObject({
      eventName: "Checkout Completed",
      body: { total: 128 },
    });
  }

  expect(providers.gtag.inbox.getSnapshot()[0]).toMatchObject({
    eventName: "purchase",
    body: { value: 128 },
  });
  expect(backend.requests.getSnapshot()[0]).toMatchObject({
    outcome: "accepted",
  });
  expect(readOutcome("Amplitude")).toContain("Submitted");
  expect(readOutcome("Your API")).toContain("Submitted");
});

test("a search and a product view each get a receipt of their own", async () => {
  renderApplication();

  fireEvent.change(screen.getByRole("searchbox", { name: "Search the shop" }), {
    target: { value: "boots" },
  });
  press("Search");

  await waitForSettled();

  expect(
    within(readLatestReceipt()).getByText('Search for "boots"'),
  ).toBeTruthy();

  fireEvent.click(product("Suede Boots").getByRole("button", { name: "View" }));

  await waitFor(() => {
    expect(
      within(readLatestReceipt()).getByText("View Suede Boots"),
    ).toBeTruthy();
  });

  const receipts = within(screen.getByRole("list", { name: "Receipts" }));

  expect(receipts.getByText('Search for "boots"')).toBeTruthy();
  expect(receipts.getByText("View Suede Boots")).toBeTruthy();
});

test("a redacted card token never reaches any destination, and the receipt says Trace removed it", async () => {
  const { providers } = renderApplication();

  press("Accept");
  addToCart("Silk Scarf");
  press("Check out");

  await waitForSettled();

  expect(providers.amplitude.inbox.getSnapshot()[0]?.body).not.toHaveProperty(
    "payment.card.token",
  );
  expect(
    within(
      within(readLatestReceipt()).getByRole("list", {
        name: "Removed before sending",
      }),
    ).getByText("properties.payment.card.token: redacted"),
  ).toBeTruthy();
});

test("switching accounts keeps each account's events under its own name", async () => {
  renderApplication();

  press("Nora Fields");
  addToCart("Canvas Tote");
  press("Check out");

  await waitForSettled();

  press("Isabella Cruz");

  expect(isPressed("Isabella Cruz")).toBe(true);
  expect(
    within(screen.getByRole("list", { name: "Receipts" })).getByText(
      /Nora Fields/,
    ),
  ).toBeTruthy();
});

test("joining a crew reaches Segment as its one group, and leaving it is refused there as unsupported", async () => {
  const { providers, runtime } = renderApplication();

  press("Accept");
  press("Night Market Crew");

  await waitFor(() => {
    expect(providers.segment.group.get()).toBe("night-market");
  });
  expect(isPressed("Night Market Crew")).toBe(true);
  expect(readCard("Segment").getByText("Night Market Crew")).toBeTruthy();

  press("No crew");

  expect(isPressed("No crew")).toBe(true);
  await waitFor(() => {
    expect(
      runtime.timeline
        .getSnapshot()
        .some(
          (entry) =>
            entry.type === "identity step unsupported" &&
            entry.destination?.name === "segment",
        ),
    ).toBe(true);
  });
  expect(providers.segment.group.get()).toBe("night-market");
  expect(readCard("Segment").getByText("Night Market Crew")).toBeTruthy();
});

test("while consent is unknown only your own API receives events, and the receipt says consent held the rest back", async () => {
  const { providers } = renderApplication();

  addToCart("Silk Scarf");
  press("Check out");
  await waitForSettled();

  expect(readOutcome("Amplitude")).toContain("Not routed");
  expect(readOutcome("Amplitude")).toContain(
    "Held back: consent was not answered yet.",
  );
  expect(readOutcome("Your API")).toContain("Submitted");
  expect(providers.amplitude.inbox.getSnapshot()).toHaveLength(0);

  press("Accept");
  addToCart("Silk Scarf");
  press("Check out");
  await waitForSettled();

  expect(readOutcome("Amplitude")).toContain("Submitted");
});

test("consent turns every SDK switch of its own on and off, and Segment, which has none, is held at Trace's door", () => {
  renderApplication();

  press("Accept");

  for (const name of ["Amplitude", "PostHog", "Mixpanel", "Google Analytics"]) {
    expect(readCard(name).getByText("Collecting")).toBeTruthy();
  }

  press("Ask again");
  press("Decline");

  for (const name of ["Amplitude", "PostHog", "Mixpanel", "Google Analytics"]) {
    expect(readCard(name).getByText("Off")).toBeTruthy();
  }

  expect(
    readCard("Segment").getByText("None of its own: Trace holds its events"),
  ).toBeTruthy();
  expect(readCard("Segment").getByText("Analytics declined")).toBeTruthy();
});

test("PostHog's own filters drop the event there without touching the other five", async () => {
  const { backend } = renderApplication();

  press("Accept");
  press("PostHog filters everything");
  addToCart("Silk Scarf");
  press("Check out");

  await waitForSettled();

  expect(readOutcome("PostHog")).toContain("Dropped");
  expect(readOutcome("Amplitude")).toContain("Submitted");
  expect(backend.requests.getSnapshot()[0]).toMatchObject({
    outcome: "accepted",
  });
});

test("an offline backend fails only its own outcome", async () => {
  renderApplication();

  press("Your API offline");
  addToCart("Canvas Tote");
  press("Check out");

  await waitFor(() => {
    expect(readOutcome("Your API")).toContain("Failed");
  });
  expect(readOutcome("Your API")).toContain("orders endpoint answered 503");
});

test("a backend slower than the timeout settles unconfirmed, not failed", async () => {
  vi.useFakeTimers();
  renderApplication();

  press("6 s");
  addToCart("Canvas Tote");
  press("Check out");

  await act(() => vi.advanceTimersByTimeAsync(3_100));

  expect(readOutcome("Your API")).toContain("Unconfirmed");
});

test("stalling Segment restarts Trace with the shopper's choices, and its checkout waits for a retried start", async () => {
  const { providers } = renderApplication();

  press("Accept");
  press("Nora Fields");
  press("Segment never loads");

  expect(isPressed("Nora Fields")).toBe(true);
  expect(screen.getByRole("button", { name: "Ask again" })).toBeTruthy();

  addToCart("Silk Scarf");
  press("Check out");

  await waitFor(() => {
    expect(readOutcome("Your API")).toContain("Submitted");
  });
  expect(readOutcome("Segment")).toContain("Sending");

  press("Segment never loads");
  press("Retry start");

  await waitFor(() => {
    expect(readOutcome("Segment")).toContain("Submitted");
  });
  expect(providers.segment.inbox.getSnapshot()[0]).toMatchObject({
    eventName: "Checkout Completed",
    user: "nora",
  });
});

test("an event still waiting when the shopper changes is dropped, never sent as the next shopper's", async () => {
  const { providers } = renderApplication();

  press("Accept");
  press("Nora Fields");
  press("Segment never loads");
  addToCart("Silk Scarf");
  press("Check out");

  await waitFor(() => {
    expect(readOutcome("Segment")).toContain("Sending");
  });

  press("Isabella Cruz");

  await waitFor(() => {
    expect(readOutcome("Segment")).toContain(
      "Dropped: the account changed before this destination could send it.",
    );
  });

  press("Segment never loads");
  press("Retry start");

  await waitFor(() => {
    expect(within(readLatestReceipt()).getByText("Settled")).toBeTruthy();
  });
  expect(
    providers.segment.inbox
      .getSnapshot()
      .some((call) => call.eventName === "Checkout Completed"),
  ).toBe(false);
});

test("the timeline names what happened, newest first", async () => {
  renderApplication();

  addToCart("Canvas Tote");
  press("Check out");
  await waitForSettled();

  const timeline = within(
    screen.getByRole("list", { name: "Timeline events" }),
  );

  expect(timeline.getAllByText("event accepted").length).toBeGreaterThan(0);
});
