---
description: "Print what Trace sends while you develop: one line per call, with the frozen, sanitized value behind it, and nothing lost on the way."
---

# Console

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-console
```

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: { console: console() },
});

trace.start();
trace.user({ id: "user_42" });
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
// [trace] identify "user_42" { user: { id: "user_42" } }
// [trace] track "Checkout Started" ["cart","value"] { id, name, properties, context, identity, timestamp }
```

Importing `console` shadows the global `console` in that module; import it as `{ console as consoleAdapter }` if the module also logs.

| Option   | Default            | Meaning                                                                                                                                                                |
| -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `writer` | the global console | Receives one entry per call: its `kind`, a one line summary and the frozen value it describes. Read on every write, so a console replaced later is the one written to. |

## How events are mapped

Each call becomes one entry with a `kind` (`track`, `identify`, `traits`, `group` or `reset`), a one-line summary prefixed `[trace]`, and the whole frozen value: the event itself for a track, the update for `identify`, `traits` and `group`, nothing for `reset`. Names, ids and keys are written as JSON so a line never breaks. There is no provider to cut anything: `losses` is always empty.

## Identity

The console holds nobody, but it shows every identity step Trace plans, in the order Trace sends them: `identify`, `traits`, `group` and `reset` each print one line, a reset printed rather than emulated.

## Consent

There is no SDK to initialize opted out and no collection of its own, so this session has no `collection`. A console destination named in `consent` still receives nothing while its purposes are not granted: Trace drops its events at acceptance and plans no identity step for it.

## Behavior

- Evidence is `sdk-call-returned`: the writer returned, or its returned promise resolved, which the adapter waits for before the outcome settles.
- No flush; `trace.flush()` reports this destination `unsupported`.
- A writer that throws or rejects fails that call: a track becomes `failed`, and a failing identity step is skipped as `identity-failed` for the event that needed it. If your console is instrumented to track what it prints, the track made from inside the write is dropped as `reentrant`, so the loop ends after one line.
- `native` is the writer in use.

See [choose an adapter](../adapters.md) for how the console compares to a real destination.
