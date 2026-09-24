import { Trace, event } from "@priemskiyyy/trace";
import type {
  ConsentDecision,
  Destinations,
  DestinationStatus,
  TraceSchema,
  TraceStatus,
} from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import { hydrate } from "solid-js/web";
import { afterEach, expect, test, vi } from "vitest";

import { VIEW_MARKUP } from "src/context/serverMarkup.fixture";
import { TraceProvider } from "src/context/TraceProvider";
import { View } from "src/context/View.fixture";
import type {
  RegisteredEvents,
  RegisteredPurpose,
  RegisteredTrace,
} from "src/types/Register";

const disposals: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposals.splice(0)) {
    dispose();
  }

  document.body.replaceChildren();
  Reflect.deleteProperty(globalThis, "_$HY");
});

const createStarted = () => {
  const trace = new Trace<
    RegisteredEvents,
    Destinations,
    TraceSchema,
    RegisteredPurpose
  >({
    events: { "App Opened": event() },
    destinations: { product: createMockAdapter().adapter },
    consent: { product: ["analytics", "advertising"] },
  });

  trace.start();
  trace.consent.set({ analytics: "granted" });

  return trace;
};

const hydrateView = (
  trace: RegisteredTrace,
  callbacks: {
    onStatus?: (status: TraceStatus) => void;
    onDestination?: (status: DestinationStatus) => void;
    onConsent?: (decisions: Record<string, ConsentDecision>) => void;
  } = {},
) => {
  // Solid hydrates through the global that the page's hydration script creates, so the test creates it.
  Object.assign(globalThis, {
    _$HY: { events: [], completed: new WeakSet(), r: {}, fe: () => {} },
  });

  const container = document.body.appendChild(document.createElement("div"));

  container.innerHTML = VIEW_MARKUP;

  const rendered = container.firstChild;

  disposals.push(
    hydrate(
      () => (
        <TraceProvider trace={trace}>
          <View {...callbacks} />
        </TraceProvider>
      ),
      container,
    ),
  );

  return { container, rendered };
};

test("server markup hydrates without a mismatch, keeping the server's node, then shows the Trace the client started", () => {
  const warn = vi.spyOn(console, "warn");
  const error = vi.spyOn(console, "error");
  const { container, rendered } = hydrateView(createStarted());

  expect(container.childNodes).toHaveLength(1);
  expect(container.firstChild).toBe(rendered);
  expect(container.textContent).toBe("started/ready/granted/unknown");
  expect(warn.mock.calls).toEqual([]);
  expect(error.mock.calls).toEqual([]);
});

test("hydrating over a Trace the client already started tells no callback, and a later change is told once", () => {
  const trace = createStarted();
  const onStatus = vi.fn();
  const onDestination = vi.fn();
  const onConsent = vi.fn();

  hydrateView(trace, { onStatus, onDestination, onConsent });

  expect(onStatus.mock.calls).toEqual([]);
  expect(onDestination.mock.calls).toEqual([]);
  expect(onConsent.mock.calls).toEqual([]);

  trace.consent.set({ advertising: "denied" });

  expect(onConsent.mock.calls).toEqual([
    [{ analytics: "granted", advertising: "denied" }],
  ]);
  expect(onStatus.mock.calls).toEqual([]);
  expect(onDestination.mock.calls).toEqual([]);
});
