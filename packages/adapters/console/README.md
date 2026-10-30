# @priemskiyyy/trace-console

Print what [Trace](../../core) sends while you develop. The destination receives what every destination receives, so its output is already sanitized and redacted.

Version 0.1.0 is an initial preview. APIs may change before 1.0. See the [verification limits](https://github.com/priemskiyyy/trace/blob/main/docs/verification.md) before adopting an adapter.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-console
```

## Create a Trace

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";

const events = {
  "Checkout Started": event<{ cartId: string; value: number }>(),
};

const trace = new Trace({
  events,
  destinations: { console: console() },
});

trace.start();
trace.user({ id: "user_42" });
trace.track("Checkout Started", { cartId: "cart_1", value: 49.5 });
// [trace] identify "user_42" { user: { id: "user_42" } }
// [trace] track "Checkout Started" ["cartId","value"] { id, name, properties, context, identity, timestamp }
```

## Options

| Option   | Default            | Meaning                                                                                                                        |
| -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `writer` | the global console | Receives one entry per call: its `kind`, a one line summary and the value it describes. Use it for a logger, a file or a test. |

## How an event is mapped

Each call is one entry, `{ kind, line, ... }`, where `line` is a one line summary prefixed `[trace]` and the rest is the frozen value itself.

| Call       | `line`                                                                              | Value    |
| ---------- | ----------------------------------------------------------------------------------- | -------- |
| `track`    | `[trace] track "Checkout Started" ["cartId","value"]`, the property keys last       | `event`  |
| `identify` | `[trace] identify "user_42"`                                                        | `update` |
| `traits`   | `[trace] traits "user_42" set ["plan"] remove ["role"]`, `anonymous` without a user | `update` |
| `group`    | `[trace] group "workspace" "w_1" ["tier"]`, or `[trace] group "workspace" left`     | `update` |
| `reset`    | `[trace] reset`                                                                     | none     |

Names, ids and keys are written as JSON, so a line never breaks. Nothing is lost on the way: the writer receives the whole event, its context, identity and timestamp included, so `losses` is always empty.

## Identity

The console holds nobody, and it still shows every identity step Trace plans for a provider, in the order Trace sends them: `identify`, `traits`, `group` and `reset` are each one entry. A reset is printed, never emulated.

## Consent

There is no SDK to initialize opted out and no collection of its own, so the session has no `collection` switch. A console destination named in `consent` receives nothing while its purposes are not granted: Trace drops its events at acceptance and plans no identity step for it.

## Behavior

- Platforms: anywhere JavaScript runs. There is no SDK and nothing to initialize, so opening never fails.
- Without a `writer`, every entry goes to `console.info`: `console.info(line, event)` for a track, `console.info(line, update)` for `identify`, `traits` and `group`, and `console.info(line)` for a reset. The console is read when an entry is written, so one replaced later is honoured.
- Importing `console` from this package shadows the global `console` in that module. TypeScript flags a `console.log` there; import it as `{ console as consoleAdapter }` if the module also logs.
- Evidence is `sdk-call-returned`: the writer returned. If it returns a promise, the call waits for it, so an event's receipt stays pending and an identity step holds back the events behind it, which keeps the lines in order.
- A writer that throws or rejects fails that call and never reaches your application: a track becomes a `failed` outcome, and an identity step fails, so the event that needed it is skipped as `identity-failed`.
- Feedback loops: if your console is instrumented to track what it prints, the track made from inside the write is dropped as `reentrant`, so the loop ends after one line. Instrumentation that forwards asynchronously is outside that guard; give it a `writer` that bypasses the instrumented console.
- Privacy: what reaches the writer was sanitized, redacted and frozen by the core. The adapter adds nothing and copies nothing.
- There is no queue and no flush. `trace.flush()` reports the console as `unsupported`.
- `native` is the writer in use.

## Tests

Every session method is tested directly against an injected writer and a spied `console.info`, with frozen fixtures shaped as the core produces them, and through a real `Trace` for what the core decides: redaction, the reentrant guard against feedback loops, receipts for failing and asynchronous writers, identity planning and consent. `testAnalyticsAdapter` runs over an injected writer and over the global console. The default writer and each line formatter in `src/formatting/` have tests of their own. There is no SDK, so there is no contracts file and no real SDK test.

## License

[MIT](LICENSE)
