---
description: "Test code that tracks through Trace with the mock adapter, assert on exactly what a destination received, and drive a slow or failing provider deterministically."
---

# Application testing

`createMockAdapter` from `@priemskiyyy/trace/mock` is a deterministic adapter for tests. It records every call and hands you the frozen event exactly as a real destination would have received it, after validation, sanitizing and identity planning.

## Assert on what was tracked

```ts
import { Trace, event } from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import { expect, test } from "vitest";

test("checkout is tracked with its cart", async () => {
  const mock = createMockAdapter();
  const trace = new Trace({
    events: {
      "Checkout Started": event<{ cartId: string; apiToken: string }>(),
    },
    destinations: { mock: mock.adapter },
  });

  trace.start();

  const receipt = trace.track("Checkout Started", {
    cartId: "cart_1",
    apiToken: "secret",
  });

  await receipt.settled;

  expect(mock.sessions[0]?.events[0]?.properties).toEqual({
    cartId: "cart_1",
    apiToken: "[Redacted]",
  });
});
```

Build your application's Trace from a function that takes the destinations, and tests can pass the mock while production passes the real adapters. Everything else, including your schema, your privacy options and your routing, is then the code under test.

## Drive a provider's timing

A real provider is slow, fails or answers late. Hold its answers and settle them when the test says:

```ts
import { Trace, event } from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import { expect, test } from "vitest";

test("a provider failure is an outcome, not an exception", async () => {
  const mock = createMockAdapter({ hold: true });
  const trace = new Trace({
    events: { "App Opened": event() },
    destinations: { mock: mock.adapter },
  });

  trace.start();

  const receipt = trace.track("App Opened");

  expect(receipt.status.get().state).toBe("pending");

  mock.tracks[0]?.fail(new Error("network down"));

  const status = await receipt.settled;

  expect(status).toMatchObject({
    state: "settled",
    outcomes: { mock: { status: "failed" } },
  });
});
```

| Option       | What it simulates                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `name`       | The adapter's own name, `"mock"` by default.                                                                        |
| `hold`       | Each `track` waits until the test answers it through `mock.tracks[n].settle(result)` or `.fail(error)`.             |
| `identity`   | `false` leaves `identify`, `traits`, `group` and `reset` out of every session.                                      |
| `collection` | `false` leaves `collection` out of every session.                                                                   |
| `flush`      | `false` leaves `flush` out; `"hold"` makes each flush wait for `mock.sessions[n].flushes[m].settle()` or `.fail()`. |
| `onOpen`     | Runs at every `open`. Throwing fails the start.                                                                     |
| `onTrack`    | Runs at every `track`. Throw, or answer a result at once; answering nothing keeps the default.                      |
| `onIdentity` | Runs at every identity call. What it throws or answers is the call's answer.                                        |

`createMockAdapter` returns `{ adapter, sessions, tracks }`. Each `open` pushes a new session, which is also its `native`, recording `events`, every identity call in order (`identity`), each `collection` switch, `flushes` and `disposeCount`. `tracks` holds every held `track` across every session, in the order they arrived, for `hold: true`. The mock is well behaved by default and deliberately able to misbehave: it never guards itself after disposal and never times out on its own. Time is injectable too: pass `now` to the Trace and use your test runner's fake timers for the buffer and the timeout.

## Dispose between tests

A Trace that is not disposed keeps its timers and what its adapters mirrored into provider SDKs:

```ts
import { Trace } from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import { afterEach, beforeEach } from "vitest";

let trace: Trace<
  typeof events,
  { mock: ReturnType<typeof createMockAdapter>["adapter"] }
>;

beforeEach(() => {
  trace = new Trace({
    events,
    destinations: { mock: createMockAdapter().adapter },
  });
  trace.start();
});

afterEach(() => {
  trace.dispose();
});
```

## React, Vue, Solid and Svelte

Render with a `TraceProvider` over a mock-backed Trace. Nothing needs to be mocked at the module level, because every binding takes the Trace as a prop.

## Testing an adapter you wrote

`testAnalyticsAdapter({ name, createAdapter })` from `@priemskiyyy/trace/testing` registers the one conformance suite every adapter must pass, over fixtures a real Trace builds for the user `conformance-user`: it names itself and opens on demand, keeps its native handle's identity, answers every event without throwing, answers `submitted` with one of the three evidence values, completes or refuses `identify`, `traits` and `group` where implemented, and requires a present `reset` to always complete, never throw `UNSUPPORTED`, so an adapter whose SDK cannot reset omits the method rather than fail the suite; it also toggles `collection` both ways where present, answers `flushed`, `timeout` or `failed` where `flush` is present, completes `dispose` where present, and gives every `open` an independent session. It cannot check coldness, mapping or evidence against a real provider; test those yourself. See [writing an adapter](writing-an-adapter.md).
