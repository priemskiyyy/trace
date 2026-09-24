---
description: "Track a declared event with trace.track, choose its destinations, context and time, read the receipt it answers, and follow accepted events on the events stream."
---

# Tracking and receipts

`track()` accepts one declared event and hands it to each destination it is routed to. It is synchronous, it never throws, and it answers a receipt at once.

```ts
const receipt = trace.track(
  "Checkout Started",
  { cart: { id: "cart_1" }, value: 49.5, currency: "EUR" },
  { to: ["research", "backend"], context: { screen: "cart" } },
);

const status = await receipt.settled;

if (status.state === "settled") {
  console.log(
    status.outcomes.research?.status,
    status.outcomes.backend?.status,
  );
}
```

The first argument is a name from your [registry](events.md), and the second the properties its declaration asks for. An event declared with `event()` takes none: `trace.track("App Opened")`.

## Options

| Option      | What it does                                                                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `to`        | Sends this event to exactly these destinations. It replaces `defaults.to` and never merges with it. See [routing](routing.md).                                                                                       |
| `context`   | Context for this event only, the last layer, which wins key by key. A `null` removes a key for this event. See [context and scopes](context-and-scopes.md).                                                          |
| `timestamp` | When it happened, in epoch milliseconds, for an event tracked after the fact. The Trace's clock by default. A value that is no time a `Date` can hold gives way to the clock, with an `invalid` loss at `timestamp`. |

An option Trace cannot use costs the event only what it must. A `context` that is not an object is an `invalid` loss at `context`, and the event is still delivered. A `to` of `null` counts as absent, so `defaults.to` applies, and any other `to` that is not a list delivers the event nowhere, as `not-routed`. Options that are not an object at all drop the event as `invalid`.

## Before the destinations are ready

An event tracked before `trace.start()`, or while its destination's start has failed, waits in that destination's buffer, 100 events for up to 30 seconds by default. Once the destination opens, it receives them in order. An event that waited too long is dropped as `buffer-expired`, or skipped as `start-failed` when its destination's start failed and it has not opened since, and when the buffer is full the oldest makes room as `buffer-overflow`. Change the bounds with `buffer: { capacity, maxAge }`. See [flush and the application lifecycle](flush.md).

## The receipt

```ts
const receipt = trace.track("Search Performed", { query: "shoes" });

receipt.id; // the event's id, also the idempotency key every destination receives
receipt.status.get(); // where the event stands right now

const status = await receipt.settled; // never rejects
```

| State     | Meaning                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| `dropped` | The event reached no destination, and `reason` says why. It is dropped at once, before `track` returns.     |
| `pending` | The event was handed to its destinations. `outcomes` holds `null` for each destination still working on it. |
| `settled` | Every destination the event was handed to has an outcome. The first answer stands.                          |

A receipt settles exactly once, and `settled` never rejects: a provider that fails is an outcome, not an exception. `receipt.status.subscribe(listener)` tells you about each outcome as it lands. A destination that consent had closed when the event was accepted gets no slot at all. [Receipts and evidence](receipts.md) lists every reason and outcome, and what each piece of evidence proves.

## The events stream

`trace.events` delivers every accepted event, after it is accepted and before any destination receives it:

```ts
const stop = trace.events.subscribe((event) => {
  console.log(event.id, event.name, event.identity.user);
});
```

- Each listener receives the deep-frozen event that every destination receives, sanitized and with its identity, context and time.
- An event dropped at acceptance never reaches the stream, and a listener never receives an event from before it subscribed.
- Subscribing opens nothing, starts no timer and tracks nothing, so observing the stream creates no demand.
- A `track` made from inside a listener is dropped as `reentrant`, so a listener that tracks cannot loop.
- A listener that throws is isolated: its error is rethrown on a microtask and recorded as the diagnostic `listener failed`, and the other listeners and the receipt are unaffected.

The stream is how the [devtools](devtools.md) and the [Flare bridge](flare.md) follow events. The function `subscribe` returns stops the listener, and after `dispose()` the stream delivers nothing.

## Where to track

Track in event handlers, and never while rendering: a render can run more than once, and an event tracked there would be sent each time. The bindings offer no hook that tracks on mount for that reason. Track screen views from your router's navigation listeners. See [React](react.md) and [React Native and Expo](react-native.md).

A `track` made synchronously from inside an adapter's own call, or from inside a diagnostics listener, is dropped as `reentrant` too, so a console that is instrumented to track what it prints stops after one line. A drop made from inside a diagnostics listener is recorded only on its receipt, never as another diagnostic, so a listener that tracks cannot feed itself.

::: warning Forwarding diagnostics as events
A diagnostics listener that forwards what it sees as events filters by type, such as `destination failed`, and tracks later, outside the listener, because a `track` made inside it is dropped. It never forwards the diagnostics of its own events: each event it tracks records diagnostics of its own, such as `event accepted`, and forwarding those would track without end.
:::

To give a group of events one more context layer, such as a checkout flow, track through a [scope](context-and-scopes.md#scopes).
