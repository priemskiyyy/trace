---
description: "Mount the Trace devtools to see each destination's status and queues, and follow an event from acceptance to its outcome, with values hidden until you ask."
---

# Diagnostics and devtools

The devtools are an in-page inspector. They show where each destination stands, what is buffered or in flight, and a searchable timeline of every accepted event and what each destination did with it.

```sh
pnpm add -D @priemskiyyy/trace-devtools
```

In React, inside your `TraceProvider`:

```tsx
import { TraceDevtools } from "@priemskiyyy/trace-devtools/react";
import { TraceProvider } from "@priemskiyyy/trace-react";

export const Root = () => (
  <TraceProvider trace={trace}>
    <Application />
    {import.meta.env.DEV ? <TraceDevtools /> : null}
  </TraceProvider>
);
```

| Binding | Import                               | Use                                                                         |
| ------- | ------------------------------------ | --------------------------------------------------------------------------- |
| React   | `@priemskiyyy/trace-devtools/react`  | `<TraceDevtools />`                                                         |
| Vue     | `@priemskiyyy/trace-devtools/vue`    | `<TraceDevtools v-if="isDevelopment" />`                                    |
| Solid   | `@priemskiyyy/trace-devtools/solid`  | `<TraceDevtools />`                                                         |
| Svelte  | `@priemskiyyy/trace-devtools/svelte` | `createDevtools()` used as `<div {@attach devtools}>`, Svelte 5.29 or newer |

Each wrapper reads the Trace from its own provider and removes the inspector when it unmounts. On the server the React and Vue wrappers render only an empty host element, the Solid wrapper renders nothing, and a Svelte attachment never runs. Anywhere else:

```ts
import { TraceDevtools } from "@priemskiyyy/trace-devtools";

const devtools = new TraceDevtools({ trace });

devtools.mount(document.body.appendChild(document.createElement("div")));
```

The element must be one that can host a shadow root, such as a `div`. Keep it out of production with a condition your bundler can remove, as above: nothing in Trace depends on it.

## Options

| Option          | Default  | Meaning                                                                  |
| --------------- | -------- | ------------------------------------------------------------------------ |
| `trace`         | required | The Trace to inspect. A wrapper reads it from the provider instead.      |
| `initialIsOpen` | `false`  | Opens the panel on the first visit. Later visits restore the last state. |
| `maxEvents`     | `200`    | Rows kept in memory, clamped to 1 to 1000.                               |

The class also has `unmount()`, `setTrace(trace)` and `setMaxEvents(count)`. Mounting twice throws `TraceError` `INVALID_CONFIGURATION`; unmounting twice does nothing. Recorded rows survive an unmount, so the timeline is there again when the inspector is remounted.

## What you get

- **Launcher**, a status dot that turns red when a failure arrived while the panel was closed.
- **Header**: whether the Trace is `idle`, `started` or `disposed`, the identity generation, the user id or `anonymous`, pending receipts, and the decision for each consent purpose.
- **Destinations**: each one with its adapter, its status, and what it has buffered and in flight. Selecting one narrows the timeline to it and to the rows that belong to no destination.
- **Timeline**: every accepted event and every diagnostic, newest first, searchable by type, destination, event id and summary, and filterable by kind. Pause stops recording, Clear empties it; neither touches the Trace.
- **An event's detail**: each destination it was routed to, its outcome as it lands, the losses that outcome reported, its identity and context, and its properties, traits and groups.

The launcher's red dot and the Errors chip count the failures (every `* failed` phrase), `buffer overflow`, and a refused user, trait or group. A dropped, skipped or indeterminate event, and an identity step a provider could not take, show under their own kind instead, because consent drops and documented unsupported steps are expected.

## It only reads

The inspector reads `trace.diagnostics` and `trace.events` and nothing else. It never starts the Trace, opens a destination or tracks an event. Recording runs while it is mounted, even collapsed; pausing stops the two streams it records and nothing else, because the snapshot behind the header stays subscribed and creates no demand.

## Without the panel

The same data is available to your own code, for example to log it in a test:

```ts
const stop = trace.diagnostics.events.subscribe((event) => {
  console.log(event.type, event.destination);
});

const snapshot = trace.diagnostics.get();

console.log(snapshot.status.state, snapshot.destinations);
```

## Privacy

Values are hidden until you turn on **Show values**. Even then the inspector shows a bounded copy, made by reading property descriptors so no getter runs, with every key `isSensitiveKey` names shown as `[Redacted]`, the same predicate the core's own redaction uses by default. Diagnostics themselves carry ids, reasons, counts and the paths of what was lost, never values, and a provider's error, which may quote configuration, is never shown. The open state, the dock, the size and **Show values** persist in `localStorage` under one key, parsed by hand: a value that does not parse is forgotten.

The [package README](https://github.com/priemskiyyy/trace/tree/main/packages/devtools#readme) covers every column and the panel's accessibility. To use the timeline to find a missing event, see [troubleshooting](troubleshooting.md).
