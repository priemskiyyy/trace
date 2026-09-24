import { Trace, TraceError, event } from "@priemskiyyy/trace";
import type { TrackResult } from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import type { MockAdapterOptions } from "@priemskiyyy/trace/mock";
import { fireEvent, within } from "@testing-library/dom";
import { afterEach, expect, test, vi } from "vitest";

import { spyOnTrace } from "src/spyOnTrace.fixture";
import { styles } from "src/styles";
import { TraceDevtools } from "src/TraceDevtools";
import type { TraceDevtoolsOptions } from "src/types/TraceDevtoolsOptions";

const SECRET = "sk_live_12345";
const PREFERENCES_KEY = "@priemskiyyy/trace-devtools";

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "clipboard");
  document.body.replaceChildren();
  localStorage.clear();
});

const events = {
  "App Opened": event(),
  "Checkout Started": event<{ plan: string; apiToken?: string }>(),
};

// The log and the snapshot each announce once per microtask, and a settled receipt needs a turn too.
const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const create = (options: MockAdapterOptions = {}) => {
  const mock = createMockAdapter({ name: "mocked", ...options });
  const trace = new Trace({ events, destinations: { primary: mock.adapter } });

  return { mock, trace };
};

const mountDevtools = (options: TraceDevtoolsOptions) => {
  const host = document.body.appendChild(document.createElement("div"));
  const devtools = new TraceDevtools(options);

  devtools.mount(host);

  // Queries need an element, and the shadow root's only child is the application root.
  const view = () => {
    const root = host.shadowRoot?.firstElementChild;

    if (!(root instanceof HTMLElement)) {
      throw new Error("Expected the devtools root inside the shadow root");
    }

    return within(root);
  };

  const panel = () =>
    view().getByRole("complementary", { name: "Trace devtools" });

  const rows = () =>
    Array.from(
      view().getByLabelText("Event timeline").querySelectorAll("details"),
    );

  const types = () =>
    rows().map((row) => row.querySelector(".event-type")?.textContent);

  const lines = () =>
    rows().map(
      (row) =>
        `${row.querySelector(".event-type")?.textContent} · ${row.querySelector(".event-destination")?.textContent}`,
    );

  const destinationLine = (name: string) =>
    within(view().getByRole("navigation", { name: "Trace destinations" }))
      .getByRole("button", { name: new RegExp(name) })
      .querySelector("small")?.textContent;

  const acceptedRow = (name: string) => {
    const row = rows().find(
      (candidate) =>
        candidate.getAttribute("data-row") === "ACCEPTED" &&
        candidate.querySelector(".event-type")?.textContent === name,
    );

    if (row === undefined) {
      throw new Error(`Expected an accepted event named ${name}`);
    }

    return row;
  };

  const launcherDot = () =>
    view()
      .getByRole("button", { name: "Open Trace devtools" })
      .querySelector(".dot")
      ?.getAttribute("data-state");

  return {
    host,
    devtools,
    view,
    panel,
    rows,
    types,
    lines,
    destinationLine,
    acceptedRow,
    launcherDot,
  };
};

const outcomeLines = (row: Element) =>
  Array.from(row.querySelectorAll(".outcome"), (outcome) => ({
    line: outcome.querySelector(".outcome-line")?.textContent,
    losses: Array.from(
      outcome.querySelectorAll(".losses li"),
      (loss) => loss.textContent,
    ),
  }));

test("the panel observes a Trace without starting it, opening a destination or tracking an event", async () => {
  const { mock, trace } = create();
  const spy = spyOnTrace(trace);

  trace.user({ id: "ada" });
  trace.track("App Opened");

  const { devtools, host, panel, destinationLine } = mountDevtools({
    trace,
    initialIsOpen: true,
  });

  await nextMacrotask();

  expect(spy.live).toEqual({
    diagnostics: 1,
    "diagnostics.events": 1,
    events: 1,
  });
  expect(mock.sessions).toEqual([]);
  expect(mock.tracks).toEqual([]);
  expect(trace.status.get()).toEqual({ state: "idle" });
  expect(trace.diagnostics.get().pendingReceipts).toBe(1);
  expect(panel().querySelector(".status")?.textContent).toBe("idle");
  expect(panel().querySelector(".counters")?.textContent).toBe(
    "generation #1 · ada · 1 pending",
  );
  expect(panel().querySelector(".consent")).toBeNull();
  expect(destinationLine("primary")).toBe("mocked · idle · 1 buffered");
  expect(host.shadowRoot?.querySelector("style")?.textContent).toBe(styles);
  expect(styles).toContain("@media (prefers-color-scheme: light)");
  devtools.unmount();
});

test("the panel follows the Trace as it changes and lists accepted events and diagnostics, newest first", async () => {
  const mock = createMockAdapter({ name: "mocked" });

  const trace = new Trace({
    events,
    destinations: { primary: mock.adapter },
    now: () => Date.UTC(2026, 8, 20, 9, 5, 7, 42),
  });

  const { devtools, panel, lines, destinationLine, acceptedRow } =
    mountDevtools({ trace, initialIsOpen: true });

  trace.start();
  trace.track("App Opened");
  await nextMacrotask();

  expect(panel().querySelector(".status")?.textContent).toBe("started");
  expect(destinationLine("primary")).toBe("mocked · ready");
  expect(lines()).toEqual([
    "event submitted · primary",
    "App Opened · event",
    "event accepted · event",
    "destination ready · primary",
    "trace started · runtime",
  ]);

  const row = acceptedRow("App Opened");
  const time = row.querySelector("time");
  const id = row.querySelector(".event-id");

  expect(time?.getAttribute("datetime")).toBe("2026-09-20T09:05:07.042Z");
  expect(time?.getAttribute("title")).toBe("2026-09-20T09:05:07.042Z");
  expect(id?.getAttribute("title")).toBe(mock.tracks[0]?.event.id);
  expect(id?.textContent).toBe(mock.tracks[0]?.event.id.slice(0, 8));
  devtools.unmount();
});

test("the header shows the generation, the user and each consent decision, and follows them", async () => {
  const mock = createMockAdapter({ name: "mocked" });

  const trace = new Trace({
    events,
    destinations: { primary: mock.adapter },
    consent: { primary: ["analytics", "advertising"] },
  });

  const { devtools, panel } = mountDevtools({ trace, initialIsOpen: true });
  const counters = () => panel().querySelector(".counters")?.textContent;
  const consent = () => panel().querySelector(".consent")?.textContent;

  expect(counters()).toBe("generation #0 · anonymous · 0 pending");
  expect(consent()).toBe("analytics unknown · advertising unknown");

  trace.user({ id: "ada" });
  trace.consent.set({ analytics: "granted", advertising: "denied" });
  await nextMacrotask();

  expect(counters()).toBe("generation #1 · ada · 0 pending");
  expect(consent()).toBe("analytics granted · advertising denied");

  trace.user(null);
  await nextMacrotask();

  expect(counters()).toBe("generation #2 · anonymous · 0 pending");
  devtools.unmount();
});

test("selecting a destination narrows the timeline to it and to what belongs to none, and all destinations brings everything back", async () => {
  const first = createMockAdapter({ name: "mocked" });
  const second = createMockAdapter({ name: "other" });

  const trace = new Trace({
    events,
    destinations: { primary: first.adapter, backup: second.adapter },
  });

  const { devtools, view, lines } = mountDevtools({
    trace,
    initialIsOpen: true,
  });

  trace.start();
  trace.track("App Opened");
  await nextMacrotask();

  const everything = [
    "event submitted · backup",
    "event submitted · primary",
    "App Opened · event",
    "event accepted · event",
    "destination ready · backup",
    "destination ready · primary",
    "trace started · runtime",
  ];

  expect(lines()).toEqual(everything);

  fireEvent.click(view().getByRole("button", { name: /backup/ }));

  expect(lines()).toEqual([
    "event submitted · backup",
    "App Opened · event",
    "event accepted · event",
    "destination ready · backup",
    "trace started · runtime",
  ]);
  expect(
    view()
      .getByRole("button", { name: /backup/ })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    view()
      .getByRole("button", { name: /All destinations/ })
      .getAttribute("aria-pressed"),
  ).toBe("false");

  fireEvent.click(view().getByRole("button", { name: /All destinations/ }));

  expect(lines()).toEqual(everything);
  expect(
    view()
      .getByRole("button", { name: /All destinations/ })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  devtools.unmount();
});

test("a failure is an error: it fills the error chip, matches the search, and lights the launcher while closed", async () => {
  const { trace } = create({
    onTrack: () => {
      throw new Error("the provider is down");
    },
  });

  const { devtools, view, host, panel, types, launcherDot } = mountDevtools({
    trace,
    initialIsOpen: true,
  });

  trace.start();
  await nextMacrotask();

  fireEvent.keyDown(panel(), { key: "Escape" });

  expect(launcherDot()).toBe("started");

  trace.track("App Opened");
  await nextMacrotask();

  expect(launcherDot()).toBe("error");

  fireEvent.click(view().getByRole("button", { name: "Open Trace devtools" }));

  expect(host.shadowRoot?.activeElement).toBe(panel());

  const kinds = view().getByRole("group", { name: "Event kinds" });

  fireEvent.click(within(kinds).getByRole("button", { name: "Errors 1" }));

  expect(types()).toEqual(["event failed"]);
  expect(panel().querySelector(".total")?.textContent).toBe("1 / 5");
  expect(host.shadowRoot?.textContent).not.toContain("the provider is down");

  fireEvent.input(view().getByRole("searchbox", { name: "Filter events" }), {
    target: { value: "nothing matches this" },
  });

  expect(view().getByText("No matching events").tagName).toBe("STRONG");

  fireEvent.click(view().getByRole("button", { name: "Clear filters" }));

  expect(types()).toEqual([
    "event failed",
    "App Opened",
    "event accepted",
    "destination ready",
    "trace started",
  ]);

  fireEvent.keyDown(panel(), { key: "Escape" });

  expect(launcherDot()).toBe("started");
  devtools.unmount();
});

test("an event that arrived does not light the launcher", async () => {
  const { trace } = create();
  const { devtools, launcherDot } = mountDevtools({ trace });

  trace.start();
  trace.track("App Opened");
  await nextMacrotask();

  expect(launcherDot()).toBe("started");
  devtools.unmount();
});

test("a drop, a skip, an indeterminate outcome and an unsupported identity step show under their own kind and leave the launcher alone", async () => {
  const answers: TrackResult[] = [
    { status: "skipped", reason: "unsupported" },
    { status: "dropped", reason: "provider-filtered", losses: [] },
    { status: "indeterminate", reason: "ambiguous" },
  ];

  const mock = createMockAdapter({
    name: "mocked",
    onTrack: () => answers.shift(),
    onIdentity: () => {
      throw new TraceError({
        code: "UNSUPPORTED",
        message: "This provider keeps no users.",
      });
    },
  });

  const gated = createMockAdapter({ name: "gated" });

  const trace = new Trace({
    events,
    destinations: { primary: mock.adapter, gated: gated.adapter },
    consent: { gated: ["analytics"] },
  });

  const { devtools, view, types, launcherDot } = mountDevtools({ trace });

  trace.start();
  trace.user({ id: "ada" });
  trace.track("App Opened", undefined, { to: ["gated"] });
  trace.track("App Opened", undefined, { to: ["primary"] });
  trace.track("App Opened", undefined, { to: ["primary"] });
  trace.track("App Opened", undefined, { to: ["primary"] });
  await nextMacrotask();

  expect(launcherDot()).toBe("started");

  fireEvent.click(view().getByRole("button", { name: "Open Trace devtools" }));

  const kinds = within(view().getByRole("group", { name: "Event kinds" }));

  expect(kinds.getByRole("button", { name: /^Errors/ }).textContent).toBe(
    "Errors 0",
  );

  fireEvent.click(kinds.getByRole("button", { name: /^Identity/ }));

  expect(types()).toEqual(["user changed", "identity step unsupported"]);

  fireEvent.click(kinds.getByRole("button", { name: /^Events/ }));

  expect(types()).toEqual([
    "event indeterminate",
    "App Opened",
    "event accepted",
    "event dropped",
    "App Opened",
    "event accepted",
    "event skipped",
    "App Opened",
    "event accepted",
    "event dropped",
  ]);
  devtools.unmount();
});

test("every kind chip counts its rows, and one kind at a time narrows them", async () => {
  const mock = createMockAdapter({ name: "mocked" });

  const trace = new Trace({
    events,
    destinations: { primary: mock.adapter },
    consent: { primary: ["analytics"] },
  });

  const { devtools, view, types } = mountDevtools({
    trace,
    initialIsOpen: true,
  });

  trace.start();
  trace.user({ id: "ada" });
  trace.track("App Opened");
  trace.consent.set({ analytics: "granted" });
  await nextMacrotask();

  const kinds = within(view().getByRole("group", { name: "Event kinds" }));

  expect(kinds.getAllByRole("button").map((chip) => chip.textContent)).toEqual([
    "All 5",
    "Errors 0",
    "Events 1",
    "Destinations 1",
    "Identity 1",
    "Consent 1",
    "Runtime 1",
  ]);

  const pressed = () =>
    kinds
      .getAllByRole("button")
      .map((chip) => chip.getAttribute("aria-pressed"));

  expect(pressed()).toEqual([
    "true",
    "false",
    "false",
    "false",
    "false",
    "false",
    "false",
  ]);

  fireEvent.click(kinds.getByRole("button", { name: "Identity 1" }));

  expect(types()).toEqual(["user changed"]);
  expect(pressed()).toEqual([
    "false",
    "false",
    "false",
    "false",
    "true",
    "false",
    "false",
  ]);

  fireEvent.click(kinds.getByRole("button", { name: "Events 1" }));

  expect(types()).toEqual(["event dropped"]);

  fireEvent.click(kinds.getByRole("button", { name: "Consent 1" }));

  expect(types()).toEqual(["consent changed"]);

  fireEvent.click(kinds.getByRole("button", { name: "All 5" }));

  expect(types()).toEqual([
    "consent changed",
    "event dropped",
    "user changed",
    "destination ready",
    "trace started",
  ]);
  devtools.unmount();
});

test("pausing stops recording, resuming continues it, clearing forgets everything, and none of it touches the Trace", async () => {
  const { mock, trace } = create();
  const spy = spyOnTrace(trace);

  const { devtools, view, types } = mountDevtools({
    trace,
    initialIsOpen: true,
    maxEvents: 3,
  });

  trace.start();
  trace.user({ id: "ada" });
  trace.user({ id: "grace" });
  await nextMacrotask();

  expect(types()).toEqual([
    "user changed",
    "user changed",
    "destination ready",
  ]);

  expect(
    view().getByRole("button", { name: "Pause" }).getAttribute("aria-pressed"),
  ).toBe("false");

  fireEvent.click(view().getByRole("button", { name: "Pause" }));

  expect(
    view().getByRole("button", { name: "Resume" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(spy.live).toEqual({
    diagnostics: 1,
    "diagnostics.events": 0,
    events: 0,
  });

  trace.track("App Opened");
  await nextMacrotask();

  expect(types()).toEqual([
    "user changed",
    "user changed",
    "destination ready",
  ]);

  fireEvent.click(view().getByRole("button", { name: "Clear" }));
  await nextMacrotask();

  expect(view().getByText("Recording paused").tagName).toBe("STRONG");

  fireEvent.input(view().getByRole("searchbox", { name: "Filter events" }), {
    target: { value: "user" },
  });

  expect(view().getByText("No matching events").tagName).toBe("STRONG");

  fireEvent.click(view().getByRole("button", { name: "Clear filters" }));

  expect(view().getByText("Recording paused").tagName).toBe("STRONG");

  fireEvent.click(view().getByRole("button", { name: "Resume" }));

  expect(spy.live).toEqual({
    diagnostics: 1,
    "diagnostics.events": 1,
    events: 1,
  });

  trace.track("App Opened");
  await nextMacrotask();

  expect(types()).toEqual(["event submitted", "App Opened", "event accepted"]);
  expect(mock.tracks.map((track) => track.event.name)).toEqual([
    "App Opened",
    "App Opened",
  ]);

  devtools.setMaxEvents(1);
  await nextMacrotask();

  expect(types()).toEqual(["event submitted"]);
  devtools.unmount();
});

test("an empty timeline says it is waiting", () => {
  const { trace } = create();
  const { devtools, view } = mountDevtools({ trace, initialIsOpen: true });

  expect(view().getByText("Waiting for events").tagName).toBe("STRONG");
  devtools.unmount();
});

test("the launcher opens the panel, the panel resizes within its bounds and docks, Escape closes it, and the state is remembered", () => {
  const { trace } = create();
  const first = mountDevtools({ trace });

  expect(
    first.view().queryByRole("complementary", { name: "Trace devtools" }),
  ).toBeNull();

  fireEvent.click(
    first.view().getByRole("button", { name: "Open Trace devtools" }),
  );

  const panel = first.panel();

  expect(first.host.shadowRoot?.activeElement).toBe(panel);

  const handle = () =>
    first.view().getByRole("separator", { name: "Resize devtools" });

  const press = (key: string, times: number) => {
    for (let index = 0; index < times; index += 1) {
      fireEvent.keyDown(handle(), { key });
    }
  };

  expect(handle().getAttribute("aria-orientation")).toBe("horizontal");
  expect(handle().getAttribute("aria-valuenow")).toBe("420");

  press("ArrowUp", 1);
  expect(panel.style.height).toBe("444px");
  press("ArrowDown", 1);
  expect(panel.style.height).toBe("420px");
  press("Enter", 1);
  expect(panel.style.height).toBe("420px");
  press("ArrowDown", 8);
  expect(panel.style.height).toBe("240px");
  press("ArrowUp", 30);
  expect(panel.style.height).toBe("744px");

  fireEvent.click(
    first.view().getByRole("button", { name: "Dock to the right" }),
  );

  expect(panel.dataset.position).toBe("right");
  expect(panel.style.width).toBe("520px");
  expect(handle().getAttribute("aria-orientation")).toBe("vertical");

  press("ArrowLeft", 1);
  expect(panel.style.width).toBe("544px");
  press("ArrowRight", 2);
  expect(panel.style.width).toBe("496px");

  fireEvent.click(
    first.view().getByRole("button", { name: "Dock to the bottom" }),
  );

  expect(panel.style.height).toBe("744px");

  fireEvent.keyDown(panel, { key: "Enter" });

  expect(first.panel()).toBe(panel);

  fireEvent.keyDown(panel, { key: "Escape" });

  expect(first.host.shadowRoot?.activeElement).toBe(
    first.view().getByRole("button", { name: "Open Trace devtools" }),
  );
  expect(localStorage.getItem(PREFERENCES_KEY)).toBe(
    JSON.stringify({
      isOpen: false,
      height: 744,
      position: "bottom",
      width: 496,
    }),
  );
  first.devtools.unmount();

  const second = mountDevtools({ trace, initialIsOpen: true });

  expect(
    second.view().getByRole("button", { name: "Open Trace devtools" }).tagName,
  ).toBe("BUTTON");
  expect(second.host.shadowRoot?.activeElement).toBeNull();
  second.devtools.unmount();
});

test("the resize handle follows a drag away from its edge until it is released", () => {
  const { trace } = create();

  const { devtools, view, panel } = mountDevtools({
    trace,
    initialIsOpen: true,
  });

  const handle = () =>
    view().getByRole("separator", { name: "Resize devtools" });

  const captured: number[] = [];

  handle().setPointerCapture = (pointerId) => {
    captured.push(pointerId);
  };

  fireEvent.pointerDown(handle(), { pointerId: 7, clientX: 900, clientY: 500 });
  fireEvent.pointerMove(handle(), { clientX: 900, clientY: 450 });

  expect(panel().style.height).toBe("470px");

  fireEvent.pointerUp(handle());
  fireEvent.pointerMove(handle(), { clientX: 900, clientY: 300 });

  expect(panel().style.height).toBe("470px");

  fireEvent.click(view().getByRole("button", { name: "Dock to the right" }));

  handle().setPointerCapture = (pointerId) => {
    captured.push(pointerId);
  };

  fireEvent.pointerDown(handle(), { pointerId: 8, clientX: 900, clientY: 500 });
  fireEvent.pointerMove(handle(), { clientX: 860, clientY: 500 });

  expect(panel().style.width).toBe("560px");
  expect(captured).toEqual([7, 8]);
  devtools.unmount();
});

test("setTrace follows another Trace, history survives a remount, and mounting twice throws", async () => {
  const original = create();
  const replacement = create();
  const originalSpy = spyOnTrace(original.trace);
  const replacementSpy = spyOnTrace(replacement.trace);

  const { devtools, host, panel, types } = mountDevtools({
    trace: original.trace,
    initialIsOpen: true,
  });

  original.trace.start();
  await nextMacrotask();

  expect(types()).toEqual(["destination ready", "trace started"]);
  expect(panel().querySelector(".status")?.textContent).toBe("started");
  expect(() => devtools.mount(host)).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message: "Trace devtools are already mounted. Call unmount() first.",
    }),
  );

  devtools.setTrace(replacement.trace);

  expect(original.trace.status.get()).toEqual({ state: "started" });
  expect(panel().querySelector(".status")?.textContent).toBe("idle");
  expect(originalSpy.live).toEqual({
    diagnostics: 0,
    "diagnostics.events": 0,
    events: 0,
  });
  expect(replacementSpy.live).toEqual({
    diagnostics: 1,
    "diagnostics.events": 1,
    events: 1,
  });

  replacement.trace.start();
  original.trace.track("App Opened");
  await nextMacrotask();

  const recorded = [
    "destination ready",
    "trace started",
    "destination ready",
    "trace started",
  ];

  expect(types()).toEqual(recorded);

  devtools.unmount();
  devtools.unmount();

  expect(host.shadowRoot?.childElementCount).toBe(0);

  devtools.mount(host);

  expect(types()).toEqual(recorded);
  devtools.unmount();
});

test("constructing observes nothing, and unmounting stops observing, so nothing is recorded or leaked afterwards", () => {
  const { trace } = create();
  const spy = spyOnTrace(trace);
  const devtools = new TraceDevtools({ trace });

  expect(spy.live).toEqual({
    diagnostics: 0,
    "diagnostics.events": 0,
    events: 0,
  });

  devtools.mount(document.body.appendChild(document.createElement("div")));

  expect(spy.live).toEqual({
    diagnostics: 1,
    "diagnostics.events": 1,
    events: 1,
  });

  devtools.unmount();

  expect(spy.live).toEqual({
    diagnostics: 0,
    "diagnostics.events": 0,
    events: 0,
  });
});

test("an accepted event's detail shows each destination's outcome as it lands, with the losses", async () => {
  const product = createMockAdapter({ name: "mocked", hold: true });

  const backend = createMockAdapter({
    name: "other",
    onTrack: () => ({
      status: "submitted",
      evidence: "backend-acknowledged",
      losses: [{ path: "timestamp", reason: "unsupported" }],
    }),
  });

  const trace = new Trace({
    events,
    destinations: { product: product.adapter, backend: backend.adapter },
  });

  const { devtools, view, types, acceptedRow } = mountDevtools({
    trace,
    initialIsOpen: true,
  });

  trace.start();
  trace.track("Checkout Started", { plan: "pro", apiToken: SECRET });
  await nextMacrotask();

  const detail = () => acceptedRow("Checkout Started");

  expect(outcomeLines(detail())).toEqual([
    { line: "product · pending", losses: [] },
    {
      line: "backend · submitted · backend-acknowledged · 2 losses",
      losses: ["properties.apiToken redacted", "timestamp unsupported"],
    },
  ]);
  expect(
    Array.from(
      detail().querySelectorAll(".accepted-losses li"),
      (loss) => loss.textContent,
    ),
  ).toEqual(["properties.apiToken redacted"]);
  expect(detail().querySelector(".identity")?.textContent).toBe(
    "#0 · anonymous",
  );

  product.tracks[0]?.settle({ status: "failed", error: new Error(SECRET) });
  await nextMacrotask();

  expect(outcomeLines(detail())).toEqual([
    { line: "product · failed", losses: [] },
    {
      line: "backend · submitted · backend-acknowledged · 2 losses",
      losses: ["properties.apiToken redacted", "timestamp unsupported"],
    },
  ]);
  expect(detail().querySelector(".outcome")?.getAttribute("data-status")).toBe(
    "failed",
  );

  fireEvent.click(view().getByRole("button", { name: /^Events/ }));

  expect(types()).toEqual([
    "event submitted",
    "Checkout Started",
    "event accepted",
  ]);
  expect(outcomeLines(detail())).toEqual([
    { line: "product · failed", losses: [] },
    {
      line: "backend · submitted · backend-acknowledged · 2 losses",
      losses: ["properties.apiToken redacted", "timestamp unsupported"],
    },
  ]);
  devtools.unmount();
});

test("a Trace disposed while the inspector is mounted shows it, and unmounting afterwards releases everything", async () => {
  const { trace } = create();
  const spy = spyOnTrace(trace);

  const { devtools, panel, types, destinationLine } = mountDevtools({
    trace,
    initialIsOpen: true,
  });

  trace.start();
  await nextMacrotask();
  trace.dispose();
  await nextMacrotask();

  expect(panel().querySelector(".status")?.textContent).toBe("disposed");
  expect(destinationLine("primary")).toBe("mocked · disposed");
  expect(types()).toEqual([
    "trace disposed",
    "destination disposed",
    "destination ready",
    "trace started",
  ]);

  devtools.unmount();

  expect(spy.live).toEqual({
    diagnostics: 0,
    "diagnostics.events": 0,
    events: 0,
  });
});

test("an accepted event whose acceptance was forgotten lists the outcomes that landed, or says there is none", async () => {
  const { trace } = create({ hold: true });

  const { devtools, acceptedRow } = mountDevtools({
    trace,
    initialIsOpen: true,
    maxEvents: 1,
  });

  trace.start();
  trace.track("App Opened");
  await nextMacrotask();

  const detail = acceptedRow("App Opened");

  expect(detail.querySelector(".outcomes")).toBeNull();
  expect(detail.querySelector("dd")?.textContent).toBe("No outcome recorded");
  expect(detail.querySelector(".accepted-losses")?.textContent).toBe(
    "None at acceptance",
  );
  devtools.unmount();
});

test("values stay hidden until Show values is on, and the choice is remembered", async () => {
  const { trace } = create();

  const { devtools, host, view, acceptedRow } = mountDevtools({
    trace,
    initialIsOpen: true,
  });

  trace.user({ id: "ada", traits: { tier: "trait-value" } });
  trace.group("workspace", { id: "w_1", traits: { size: "group-value" } });
  trace.context({ screen: "context-value" });
  trace.track("Checkout Started", { plan: "property-value" });
  await nextMacrotask();

  const values = () =>
    acceptedRow("Checkout Started").querySelector(".values")?.textContent;

  const markupHolding = () =>
    ["trait-value", "group-value", "context-value", "property-value"].filter(
      (value) => host.shadowRoot?.innerHTML.includes(value),
    );

  expect(markupHolding()).toEqual([]);
  expect(values()).toBe(
    "Hidden. Turn on Show values to see the properties, context, traits and groups.",
  );

  const checkbox = () => view().getByRole("checkbox", { name: "Show values" });

  expect(checkbox()).toHaveProperty("checked", false);

  fireEvent.click(checkbox());

  const shown = JSON.stringify(
    {
      properties: { plan: "property-value" },
      context: { screen: "context-value" },
      traits: { tier: "trait-value" },
      groups: { workspace: { id: "w_1", traits: { size: "group-value" } } },
    },
    null,
    2,
  );

  expect(values()).toBe(`${shown}Copy`);
  expect(markupHolding()).toEqual([
    "trait-value",
    "group-value",
    "context-value",
    "property-value",
  ]);
  expect(localStorage.getItem(PREFERENCES_KEY)).toBe(
    JSON.stringify({ isOpen: true, showValues: true }),
  );

  devtools.unmount();
  devtools.mount(host);

  expect(checkbox()).toHaveProperty("checked", true);
  expect(values()).toBe(`${shown}Copy`);

  fireEvent.click(checkbox());

  expect(values()).toBe(
    "Hidden. Turn on Show values to see the properties, context, traits and groups.",
  );
  expect(markupHolding()).toEqual([]);
  devtools.unmount();
});

test("a secret appears nowhere, even with values shown", async () => {
  const mock = createMockAdapter({ name: "mocked" });

  const broken = createMockAdapter({
    name: "broken",
    onOpen: () => {
      throw new Error(`refused key ${SECRET}`);
    },
  });

  const trace = new Trace({
    events,
    destinations: { primary: mock.adapter, broken: broken.adapter },
    privacy: { redact: () => false },
  });

  const { devtools, host, view, acceptedRow } = mountDevtools({
    trace,
    initialIsOpen: true,
  });

  trace.start();
  trace.user({ id: "ada", traits: { password: SECRET } });
  trace.group("workspace", { id: "w_1", traits: { secret: SECRET } });
  trace.context({ authorization: `Bearer ${SECRET}` });
  trace.track("Checkout Started", { plan: "pro", apiToken: SECRET });
  await nextMacrotask();

  fireEvent.click(view().getByRole("checkbox", { name: "Show values" }));

  expect(mock.tracks[0]?.event.properties).toEqual({
    plan: "pro",
    apiToken: SECRET,
  });
  expect(
    acceptedRow("Checkout Started").querySelector(".values pre")?.textContent,
  ).toBe(
    JSON.stringify(
      {
        properties: { plan: "pro", apiToken: "[Redacted]" },
        context: { authorization: "[Redacted]" },
        traits: { password: "[Redacted]" },
        groups: { workspace: { id: "w_1", traits: { secret: "[Redacted]" } } },
      },
      null,
      2,
    ),
  );
  expect(host.shadowRoot?.innerHTML).not.toContain(SECRET);
  expect(localStorage.getItem(PREFERENCES_KEY)).not.toContain(SECRET);
  devtools.unmount();
});

test("a row's context is copied as shown, with brief feedback that unmounting clears", async () => {
  const writeText = vi.fn((text: string) => Promise.resolve(text));

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  const { trace } = create();
  const { devtools, rows } = mountDevtools({ trace, initialIsOpen: true });

  trace.start();
  await nextMacrotask();

  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

  const copy = () => within(rows()[1] ?? document.body).getByRole("button");

  fireEvent.click(copy());
  await Promise.resolve();

  expect(writeText.mock.calls).toEqual([["null"]]);
  expect(copy().textContent).toBe("Copied");

  vi.advanceTimersByTime(1_199);
  expect(copy().textContent).toBe("Copied");
  vi.advanceTimersByTime(1);
  expect(copy().textContent).toBe("Copy");

  fireEvent.click(copy());
  await Promise.resolve();

  expect(vi.getTimerCount()).toBe(1);

  devtools.unmount();

  expect(vi.getTimerCount()).toBe(0);
});

test("copying without a clipboard, or with one that refuses, changes nothing", async () => {
  const { trace } = create();
  const { devtools, rows } = mountDevtools({ trace, initialIsOpen: true });

  trace.start();
  await nextMacrotask();

  const copy = () => within(rows()[0] ?? document.body).getByRole("button");
  const reported: unknown[] = [];

  const handleError = (event: ErrorEvent) => {
    reported.push(event.error);
  };

  window.addEventListener("error", handleError);
  fireEvent.click(copy());
  await nextMacrotask();
  window.removeEventListener("error", handleError);

  expect(reported).toEqual([]);
  expect(copy().textContent).toBe("Copy");

  const writeText = vi.fn(() => Promise.reject(new Error("denied")));

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  fireEvent.click(copy());
  await nextMacrotask();

  expect(writeText.mock.calls).toEqual([["null"]]);
  expect(copy().textContent).toBe("Copy");
  devtools.unmount();
});

test("names are shown as text, never parsed as markup", async () => {
  const mock = createMockAdapter({ name: "<img src=x onerror=alert(1)>" });

  const trace = new Trace({
    events: { "<i>italic</i>": event() },
    destinations: { "<b>bold</b>": mock.adapter },
  });

  const { devtools, host, panel, types, destinationLine } = mountDevtools({
    trace,
    initialIsOpen: true,
  });

  trace.user({ id: "<u>user</u>" });
  trace.track("<i>italic</i>");
  await nextMacrotask();

  expect(host.shadowRoot?.querySelector("img, b, i, u")).toBeNull();
  expect(destinationLine("bold")).toBe(
    "<img src=x onerror=alert(1)> · idle · 1 buffered",
  );
  expect(panel().querySelector(".counters")?.textContent).toBe(
    "generation #1 · <u>user</u> · 1 pending",
  );
  expect(types()).toEqual(["<i>italic</i>", "event accepted", "user changed"]);
  devtools.unmount();
});

test("a clock outside the calendar leaves the time blank instead of breaking the timeline", async () => {
  const mock = createMockAdapter({ name: "mocked" });

  const trace = new Trace({
    events,
    destinations: { primary: mock.adapter },
    now: () => 1e20,
  });

  const { devtools, rows, types } = mountDevtools({
    trace,
    initialIsOpen: true,
  });

  trace.start();
  await nextMacrotask();

  expect(types()).toEqual(["destination ready", "trace started"]);
  expect(rows().map((row) => row.querySelector("time")?.textContent)).toEqual([
    "",
    "",
  ]);
  devtools.unmount();
});
