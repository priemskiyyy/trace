import { Trace, event } from "@priemskiyyy/trace";
import type { Destinations, TraceSchema } from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import { flushSync, hydrate, unmount } from "svelte";
import { afterEach, expect, test, vi } from "vitest";

import type { RegisteredEvents, RegisteredPurpose } from "../types/Register.js";
import ViewHarness from "../utilities/ViewHarness.fixture.svelte";
import { VIEW_MARKUP } from "./serverMarkup.fixture.js";

afterEach(() => {
  document.body.replaceChildren();
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

const createTarget = (markup: string) => {
  const target = document.body.appendChild(document.createElement("div"));

  target.innerHTML = markup;

  return target;
};

test("server markup hydrates without a mismatch, then shows the Trace the client started", () => {
  const warn = vi.spyOn(console, "warn");
  const error = vi.spyOn(console, "error");
  const trace = createStarted();
  const target = createTarget(VIEW_MARKUP);
  const app = hydrate(ViewHarness, { target, props: { trace } });

  flushSync();

  expect(warn.mock.calls).toEqual([]);
  expect(error.mock.calls).toEqual([]);
  expect(target.textContent).toBe("started/ready/granted/unknown");

  unmount(app);
});

test("hydrating over a Trace the client already started tells no callback, and a later change is told once", () => {
  const warn = vi.spyOn(console, "warn");
  const trace = createStarted();
  const onStatus = vi.fn();
  const onDestination = vi.fn();
  const onConsent = vi.fn();

  const target = createTarget(VIEW_MARKUP);

  const app = hydrate(ViewHarness, {
    target,
    props: { trace, onStatus, onDestination, onConsent },
  });

  flushSync();

  expect(target.textContent).toBe("started/ready/granted/unknown");
  expect(warn.mock.calls).toEqual([]);
  expect(onStatus.mock.calls).toEqual([]);
  expect(onDestination.mock.calls).toEqual([]);
  expect(onConsent.mock.calls).toEqual([]);

  trace.consent.set({ advertising: "denied" });

  expect(onConsent.mock.calls).toEqual([
    [{ analytics: "granted", advertising: "denied" }],
  ]);
  expect(onStatus.mock.calls).toEqual([]);
  expect(onDestination.mock.calls).toEqual([]);

  unmount(app);
});
