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

import { Application } from "src/Application";
import type { BoutiqueRuntime } from "src/types/BoutiqueRuntime";
import { startBoutique } from "src/utils/startBoutique";

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
  const runtime = startBoutique({ latency: 0 });

  runtimes.push(runtime);

  const view = render(<Application runtime={runtime} />);

  return { runtime, view };
};

const press = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
};

const product = (name: string) =>
  within(screen.getByRole("listitem", { name }));

const readLatestReceipt = () =>
  screen.getByRole("region", { name: "Latest receipt" });

const readOutcome = (destination: string) =>
  within(readLatestReceipt()).getByRole("listitem", { name: destination })
    .textContent;

const waitForSettled = () =>
  waitFor(() => {
    expect(within(readLatestReceipt()).getByText("Settled")).toBeTruthy();
  });

const grantConsent = () => {
  press("Accept");
};

// Segment starts uninitialized, so a receipt tracked while it is gated by
// consent never settles until it is turned on and start is retried.
const openEveryDestination = () => {
  grantConsent();
  press("Segment not initialized");
  press("Retry start");
};

test("Boutique opens anonymous, with an empty cart and nothing tracked yet", () => {
  renderApplication();

  expect(
    screen
      .getByRole("button", { name: "Sign out" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.getByText("Your cart is empty")).toBeTruthy();
  expect(
    within(readLatestReceipt()).getByText("Nothing tracked yet"),
  ).toBeTruthy();
});

test("checking out reaches every destination with the same accepted event", async () => {
  const { runtime } = renderApplication();

  openEveryDestination();
  fireEvent.click(
    product("Suede Boots").getByRole("button", { name: "Add to cart" }),
  );
  press("Check out");

  await waitForSettled();

  expect(runtime.providers.amplitude.inbox.getSnapshot()[0]).toMatchObject({
    eventName: "Checkout Completed",
    body: { total: 128 },
  });
  expect(runtime.providers.posthog.inbox.getSnapshot()[0]).toMatchObject({
    eventName: "Checkout Completed",
    body: { total: 128 },
  });
  expect(runtime.providers.mixpanel.inbox.getSnapshot()[0]).toMatchObject({
    eventName: "Checkout Completed",
    body: { total: 128 },
  });
  expect(runtime.providers.segment.inbox.getSnapshot()[0]).toMatchObject({
    eventName: "Checkout Completed",
    body: { total: 128 },
  });
  expect(runtime.providers.gtag.inbox.getSnapshot()[0]).toMatchObject({
    eventName: "purchase",
    body: { value: 128 },
  });
  expect(runtime.backend.requests.getSnapshot()[0]).toMatchObject({
    outcome: "accepted",
  });
  expect(readOutcome("Amplitude")).toContain("Submitted");
  expect(readOutcome("Your API")).toContain("Submitted");
});

test("a redacted card token never reaches any destination, and the receipt says so", async () => {
  const { runtime } = renderApplication();

  openEveryDestination();
  fireEvent.click(
    product("Silk Scarf").getByRole("button", { name: "Add to cart" }),
  );
  press("Check out");

  await waitForSettled();

  expect(
    runtime.providers.amplitude.inbox.getSnapshot()[0]?.body,
  ).not.toHaveProperty("payment.card.token");
  expect(runtime.backend.requests.getSnapshot()[0]).toBeDefined();
  expect(
    within(readLatestReceipt()).getAllByText(
      "properties.payment.card.token: redacted",
    ).length,
  ).toBeGreaterThan(0);
});

test("switching accounts keeps each account's events under its own name", async () => {
  const { runtime } = renderApplication();

  press("Nora Fields");
  fireEvent.click(
    product("Canvas Tote").getByRole("button", { name: "Add to cart" }),
  );
  press("Check out");
  await waitForSettled();

  press("Isabella Cruz");

  await waitFor(() => {
    expect(runtime.receipts.getSnapshot()).toHaveLength(1);
  });

  const [tracked] = runtime.receipts.getSnapshot();

  expect(tracked?.account).toBe("nora");

  const timeline = within(
    screen.getByRole("list", { name: "Account timeline" }),
  );

  expect(timeline.getByText(/Nora Fields/)).toBeTruthy();
  expect(timeline.queryByText(/Isabella Cruz/)).toBeNull();
  expect(screen.getByText("Signed in now: Isabella Cruz.")).toBeTruthy();
});

test("joining a crew reaches Segment as its one group, and leaving it is refused there as unsupported", async () => {
  const { runtime } = renderApplication();

  openEveryDestination();
  press("Night Market Crew");

  await waitFor(() => {
    expect(runtime.providers.segment.group.get()).toBe("night-market");
  });
  expect(screen.getByText("In Night Market Crew.")).toBeTruthy();

  press("Leave crew");

  expect(screen.getByText("Not in a crew.")).toBeTruthy();
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
  expect(runtime.providers.segment.group.get()).toBe("night-market");
});

test("while consent is unknown only your own API receives events, and accepting opens the rest", async () => {
  const { runtime } = renderApplication();

  fireEvent.click(
    product("Silk Scarf").getByRole("button", { name: "Add to cart" }),
  );
  press("Check out");
  await waitForSettled();

  expect(readOutcome("Amplitude")).toContain("Not routed");
  expect(readOutcome("Your API")).toContain("Submitted");
  expect(runtime.providers.amplitude.inbox.getSnapshot()).toHaveLength(0);

  openEveryDestination();
  fireEvent.click(
    product("Silk Scarf").getByRole("button", { name: "Add to cart" }),
  );
  press("Check out");
  await waitForSettled();

  expect(readOutcome("Amplitude")).toContain("Submitted");
});

test("PostHog's own filters drop the event there without touching the other five", async () => {
  const { runtime } = renderApplication();

  openEveryDestination();
  press("PostHog filters everything");
  fireEvent.click(
    product("Silk Scarf").getByRole("button", { name: "Add to cart" }),
  );
  press("Check out");

  await waitForSettled();

  expect(readOutcome("PostHog")).toContain("Dropped");
  expect(readOutcome("Amplitude")).toContain("Submitted");
  expect(runtime.backend.requests.getSnapshot()[0]).toMatchObject({
    outcome: "accepted",
  });
});

test("an offline backend fails only its own outcome", async () => {
  renderApplication();

  press("Your API offline");
  fireEvent.click(
    product("Canvas Tote").getByRole("button", { name: "Add to cart" }),
  );
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
  fireEvent.click(
    product("Canvas Tote").getByRole("button", { name: "Add to cart" }),
  );
  press("Check out");

  await act(() => vi.advanceTimersByTimeAsync(3_100));

  expect(readOutcome("Your API")).toContain("Unconfirmed");
});

test("a checkout waits in the buffer while Segment is uninitialized, then delivers once start is retried", async () => {
  const { runtime } = renderApplication();

  grantConsent();
  fireEvent.click(
    product("Silk Scarf").getByRole("button", { name: "Add to cart" }),
  );
  press("Check out");

  await waitFor(() => {
    expect(readOutcome("Your API")).toContain("Submitted");
  });
  expect(readOutcome("Segment")).toContain("Sending");

  press("Segment not initialized");
  press("Retry start");

  await waitFor(() => {
    expect(readOutcome("Segment")).toContain("Submitted");
  });
  expect(runtime.providers.segment.inbox.getSnapshot()[0]).toMatchObject({
    eventName: "Checkout Completed",
  });
});

test("the timeline names what happened, newest first", async () => {
  renderApplication();

  fireEvent.click(
    product("Canvas Tote").getByRole("button", { name: "Add to cart" }),
  );
  press("Check out");
  await waitForSettled();

  const timeline = within(
    screen.getByRole("list", { name: "Timeline events" }),
  );

  expect(timeline.getAllByText("event accepted").length).toBeGreaterThan(0);
});
