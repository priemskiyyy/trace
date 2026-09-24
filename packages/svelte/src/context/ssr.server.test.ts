import { Trace, event } from "@priemskiyyy/trace";
import type {
  ConsentDecision,
  Destinations,
  DestinationStatus,
  TraceSchema,
  TraceStatus,
} from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import { render } from "svelte/server";
import { expect, test, vi } from "vitest";

import type { RegisteredEvents, RegisteredPurpose } from "../types/Register.js";
import CallHarness from "../utilities/CallHarness.fixture.svelte";
import { spyOnTrace } from "../utilities/spyOnTrace.fixture.js";
import { useConsent } from "../utilities/useConsent.js";
import { useDestinationStatus } from "../utilities/useDestinationStatus.js";
import { useTraceStatus } from "../utilities/useTraceStatus.js";
import ViewHarness from "../utilities/ViewHarness.fixture.svelte";
import { VIEW_MARKUP } from "./serverMarkup.fixture.js";

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

test("a server render reads idle and unknown and subscribes nothing, callbacks included", () => {
  expect(typeof window).toBe("undefined");

  const { mock, trace } = create();
  const spy = spyOnTrace(trace);
  const onStatus = vi.fn();
  const onDestination = vi.fn();
  const onConsent = vi.fn();

  expect(
    render(ViewHarness, {
      props: { trace, onStatus, onDestination, onConsent },
    }).body,
  ).toBe(VIEW_MARKUP);
  expect(spy.calls).toEqual([]);
  expect(mock.sessions).toEqual([]);
  expect(onStatus.mock.calls).toEqual([]);
  expect(onDestination.mock.calls).toEqual([]);
  expect(onConsent.mock.calls).toEqual([]);
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

  const use = () =>
    read(
      useTraceStatus().current,
      useDestinationStatus("product").current,
      useConsent().current,
    );

  const renderOnServer = () =>
    render(CallHarness, { props: { trace, use } }).body;

  renderOnServer();
  trace.start();
  trace.consent.set({ analytics: "granted", advertising: "denied" });
  renderOnServer();

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
