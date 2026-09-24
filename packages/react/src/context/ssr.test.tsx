// @vitest-environment jsdom
import { Trace, event } from "@priemskiyyy/trace";
import type {
  ConsentDecision,
  Destinations,
  DestinationStatus,
  TraceSchema,
  TraceStatus,
} from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import { act } from "@testing-library/react";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, test, vi } from "vitest";

import { TraceProvider } from "src/context/TraceProvider";
import { spyOnTrace } from "src/hooks/spyOnTrace.fixture";
import { useConsent } from "src/hooks/useConsent";
import { useDestinationStatus } from "src/hooks/useDestinationStatus";
import { useTraceStatus } from "src/hooks/useTraceStatus";
import type { RegisteredEvents, RegisteredPurpose } from "src/types/Register";

const create = () => {
  const mock = createMockAdapter();

  const trace = new Trace<
    RegisteredEvents,
    Destinations,
    TraceSchema,
    RegisteredPurpose
  >({
    events: { "App Opened": event() },
    destinations: { product: mock.adapter },
    consent: { product: ["analytics", "advertising"] },
  });

  return { mock, trace };
};

const View = () => {
  const status = useTraceStatus();
  const destination = useDestinationStatus("product");
  const consent = useConsent();

  return (
    <span>{`${status.state}/${destination.state}/${consent.analytics}/${consent.advertising}`}</span>
  );
};

test("a server render reads idle and unknown and subscribes nothing, and the client hydrates from the same snapshots without a mismatch", async () => {
  const { mock, trace } = create();
  const spy = spyOnTrace(trace);
  const logged = vi.spyOn(console, "error");
  const onRecoverableError = vi.fn();

  const view = (
    <TraceProvider trace={trace}>
      <View />
    </TraceProvider>
  );

  const html = renderToString(view);

  expect(html).toBe("<span>idle/idle/unknown/unknown</span>");
  expect(spy.calls).toEqual([]);
  expect(mock.sessions).toEqual([]);

  trace.start();
  trace.consent.set({ analytics: "granted" });

  const container = document.createElement("div");

  container.innerHTML = html;
  document.body.append(container);

  let root: ReturnType<typeof hydrateRoot> | undefined;

  await act(async () => {
    root = hydrateRoot(container, view, { onRecoverableError });
    await Promise.resolve();
  });

  expect(onRecoverableError.mock.calls).toEqual([]);
  expect(logged.mock.calls).toEqual([]);
  expect(container.textContent).toBe("started/ready/granted/unknown");

  act(() => root?.unmount());
  container.remove();
});

test("hydrating over a Trace the client already started tells no callback, and a later change is told once", async () => {
  const { trace } = create();
  const onStatus = vi.fn();
  const onDestination = vi.fn();
  const onConsent = vi.fn();
  const onRecoverableError = vi.fn();

  const Watcher = () => {
    const status = useTraceStatus(onStatus);
    const destination = useDestinationStatus("product", onDestination);
    const consent = useConsent(onConsent);

    return (
      <span>{`${status.state}/${destination.state}/${consent.analytics}/${consent.advertising}`}</span>
    );
  };

  const view = (
    <StrictMode>
      <TraceProvider trace={trace}>
        <Watcher />
      </TraceProvider>
    </StrictMode>
  );

  const html = renderToString(view);

  trace.start();
  trace.consent.set({ analytics: "granted" });

  const container = document.createElement("div");

  container.innerHTML = html;
  document.body.append(container);

  let root: ReturnType<typeof hydrateRoot> | undefined;

  await act(async () => {
    root = hydrateRoot(container, view, { onRecoverableError });
    await Promise.resolve();
  });

  expect(container.textContent).toBe("started/ready/granted/unknown");
  expect(onRecoverableError.mock.calls).toEqual([]);
  expect(onStatus.mock.calls).toEqual([]);
  expect(onDestination.mock.calls).toEqual([]);
  expect(onConsent.mock.calls).toEqual([]);

  act(() => trace.consent.set({ advertising: "denied" }));

  expect(onConsent.mock.calls).toEqual([
    [{ analytics: "granted", advertising: "denied" }],
  ]);
  expect(onStatus.mock.calls).toEqual([]);
  expect(onDestination.mock.calls).toEqual([]);

  act(() => root?.unmount());
  container.remove();
});

test("the server snapshots are frozen and the idle statuses interned, whatever the Trace holds when the server renders", () => {
  const { trace } = create();

  const read =
    vi.fn<
      (
        status: TraceStatus,
        destination: DestinationStatus,
        consent: Record<string, ConsentDecision>,
      ) => void
    >();

  const Probe = () => {
    read(useTraceStatus(), useDestinationStatus("product"), useConsent());

    return null;
  };

  const view = (
    <TraceProvider trace={trace}>
      <Probe />
    </TraceProvider>
  );

  renderToString(view);
  trace.start();
  trace.consent.set({ analytics: "granted", advertising: "denied" });
  renderToString(view);

  const [first, second] = read.mock.calls;

  expect(read.mock.calls).toEqual([
    [
      { state: "idle" },
      { state: "idle" },
      { analytics: "unknown", advertising: "unknown" },
    ],
    [
      { state: "idle" },
      { state: "idle" },
      { analytics: "unknown", advertising: "unknown" },
    ],
  ]);
  expect(second?.[0]).toBe(first?.[0]);
  expect(second?.[1]).toBe(first?.[1]);
  expect(first?.map((snapshot) => Object.isFrozen(snapshot))).toEqual([
    true,
    true,
    true,
  ]);
});
