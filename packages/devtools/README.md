# @priemskiyyy/trace-devtools

An in-page inspector for [Trace](../core). It shows where each destination stands, whose events they are and which consent decisions apply, and a searchable timeline of every accepted event and of what each destination did with it.

It reads `trace.diagnostics` and `trace.events` and nothing else. It never starts the Trace, opens a destination or tracks an event, and it keeps an event's values hidden until you ask to see them.

The inspector is framework independent. It carries its own small UI runtime inside its bundle and renders in a shadow root, so your application needs nothing installed for it, and neither side's styles reach the other.

## Installation

```sh
pnpm add -D @priemskiyyy/trace-devtools
```

## Mount it

In React, inside your `TraceProvider`:

<!-- snippet: fragment -->

```tsx
import { TraceDevtools } from "@priemskiyyy/trace-devtools/react";
import { TraceProvider } from "@priemskiyyy/trace-react";

<TraceProvider trace={trace}>
  <Application />
  {import.meta.env.DEV ? <TraceDevtools /> : null}
</TraceProvider>;
```

The other bindings have a wrapper of their own, each reading the Trace from its provider:

| Binding | Import                               | Use                                                                                              |
| ------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| React   | `@priemskiyyy/trace-devtools/react`  | `<TraceDevtools />`                                                                              |
| Vue     | `@priemskiyyy/trace-devtools/vue`    | `<TraceDevtools v-if="isDevelopment" />`                                                         |
| Solid   | `@priemskiyyy/trace-devtools/solid`  | `<TraceDevtools />`                                                                              |
| Svelte  | `@priemskiyyy/trace-devtools/svelte` | `const devtools = createDevtools();` then `<div {@attach devtools}></div>`, Svelte 5.29 or newer |

Every wrapper follows a provider that is given another Trace and removes the inspector when it unmounts. On the server the React and Vue wrappers render only their empty host element, the Solid wrapper renders nothing, and a Svelte attachment never runs.

Anywhere else:

```ts
import { TraceDevtools } from "@priemskiyyy/trace-devtools";

const devtools = new TraceDevtools({ trace });

devtools.mount(document.body.appendChild(document.createElement("div")));
```

The element must be one that can host a shadow root, such as a `div`. Keep it out of production builds with a condition your bundler can remove, as above. The inspector is a development tool, and nothing in Trace depends on it.

## Options

| Option          | Default | Meaning                                                                       |
| --------------- | ------- | ----------------------------------------------------------------------------- |
| `trace`         | -       | The Trace to inspect. A wrapper reads it from the provider instead.           |
| `initialIsOpen` | `false` | Opens the panel on the first visit. Later visits restore the last open state. |
| `maxEvents`     | `200`   | Rows kept in memory, clamped to 1 to 1000.                                    |

The class also has `unmount()`, `setTrace(trace)` and `setMaxEvents(count)`. Mounting twice throws a `TraceError` with the code `INVALID_CONFIGURATION`; unmounting twice does nothing. Recorded rows survive an unmount, so the timeline is still there when the inspector is mounted again.

## What it shows

- **Launcher**: a small pill with a status dot. The dot turns red when an error, as the Errors chip counts them, arrives while the panel is closed, and clears once you have looked.
- **Header**: whether the Trace is `idle`, `started` or `disposed`, then the identity generation, the user id or `anonymous`, the receipts still pending, and the decision for each consent purpose. The panel docks to the bottom or to the right and resizes by dragging its edge or with the arrow keys.
- **Destinations**: each one with its adapter, its status, and what it has buffered and in flight. Selecting one narrows the timeline to it and to the rows that belong to no destination, since a dropped event or an idle Trace is often why a destination saw nothing.
- **Timeline**: every accepted event and every diagnostic, newest first, with its time, its type (an accepted event's name), its destination, a short event id and a one-line summary. Search matches the type, the destination, the event id, the summary and a diagnostic's detail, never an event's values. The kind chips narrow to errors, events, destinations, identity, consent or runtime, each with a live count. Pause stops recording and Clear empties the timeline. Neither touches the Trace.
- **An accepted event's detail**: each destination it was routed to, with its outcome as it lands (`pending` until then) and the losses that outcome reported, what the event lost when it was accepted, its identity generation and user, and its values: the properties, the context, the traits and the groups.

The Errors chip and the launcher's red dot count the failures (every `* failed` phrase, such as `event failed` or `identity step failed`), a `buffer overflow`, and a refused user, trait or group. A dropped, skipped or indeterminate event and an identity step the provider could not take show under their own kind, Events or Identity, because consent drops and documented unsupported steps are expected.

Recording runs while the inspector is mounted, also when the panel is collapsed. Pause stops the two streams it records, the diagnostic events and the accepted events, and nothing else: the snapshot behind the header and the destination list stays subscribed and live, because it creates no demand.

## Privacy

Values are hidden until you turn on **Show values**. Even then the inspector shows a copy of the event, bounded to 200 values, 50 entries per object, six levels and 2,000 characters per string, made by reading property descriptors so that no getter or `toJSON` runs, with every key `isSensitiveKey` names shown as `[Redacted]`. Redaction goes by key: a secret under an innocent key is shown once values are.

Diagnostics carry ids, names, reasons, counts and the paths of what was lost, never values. A provider's error, which may quote configuration, is never shown. Every string is written as text, never as markup.

The open state, the dock, the size and **Show values** are remembered in `localStorage` under `@priemskiyyy/trace-devtools`. A stored value that does not parse is forgotten, and storage that refuses a write keeps the value for the page.

## Accessibility

The launcher and every control are native buttons or inputs with a visible focus ring. The panel is a labelled complementary landmark, the destinations are a labelled navigation, the resize handle is a focusable separator, and kind chips and destinations state whether they are pressed. Opening moves focus into the panel and Escape closes it and returns focus to the launcher, while a panel restored from a previous visit never steals focus. Motion is removed for people who ask for less of it, and the panel follows the light or dark preference.

## Diagnose a missing event

1. Press the Events chip, or search for `event dropped`. An `event dropped` row without a destination names why the event was never accepted: `invalid`, `sanitizer-failed`, `consent`, `not-routed`, `reentrant` or `disposed`.
2. If the event was accepted, expand its row. Its outcomes list every destination it was routed to. A destination you expected that is not listed is a routing question: `defaults.to`, the event's own `to`, or a destination closed by consent when it was tracked.
3. Read that destination's outcome. `skipped` and `dropped` name their reason. `indeterminate` with `timeout` means the provider took too long, which does not prove the event was lost. `pending` means it is still buffered or in flight, and the destination list says which.
4. If the outcome is `submitted`, Trace handed the event over. Its evidence says how far that is proven; after that, look in the provider's own tools.

## Tests

The tests render into a real shadow root in jsdom and query it by role, over Trace's mock adapter. They count live listeners to prove that constructing the inspector subscribes to nothing and that pausing and unmounting release what it subscribed, render each wrapper through its own binding (React under Strict Mode), and assert that no value appears anywhere in the panel's markup, attributes included, until Show values is on, and that a secret the application chose not to redact appears nowhere, even with values shown. A second project renders every wrapper on a server, with no `window` and each framework's server build, and asserts the exact markup (an empty host element, or nothing for Solid) and that nothing is subscribed. Resizing is tested with the keyboard and with pointer events in jsdom, not in a browser.

## License

[MIT](LICENSE)
