---
description: "Write a Trace adapter for another analytics provider: the session contract, results and losses, identity rules, and the conformance suite every adapter passes."
---

# Writing an adapter

An adapter maps one sanitized event onto one provider and nothing more. It owns no policy: validation, sanitizing, identity planning, consent, buffering and deadlines all happen before it is called, and the core never branches on an adapter's name.

## The smallest adapter

```ts
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

type Beacon = { send: (body: string) => boolean };

export const beacon = ({ sdk }: { sdk: Beacon }): AnalyticsAdapter<Beacon> => ({
  name: "beacon",
  open: () => ({
    native: sdk,
    track: (event) => {
      if (!sdk.send(JSON.stringify(event))) {
        return {
          status: "failed",
          error: new Error("The beacon was refused."),
        };
      }

      return { status: "submitted", evidence: "sdk-call-returned" };
    },
  }),
});
```

An adapter is a name and an `open` function. `open` runs when the Trace starts and returns the session: the provider handle as `native`, `track`, and when the provider needs them, `identify`, `traits`, `group`, `reset`, `collection`, `flush` and `dispose`. Trace owns the lifecycle around the session: it opens each destination once, calls `dispose` once when there is one, and calls nothing on a session after that.

## The rules

**The factory is cold.** Creating the adapter reads nothing, opens nothing, sends nothing. It may run at module scope on a server.

**Take the SDK the application already set up.** The option is `sdk`, typed structurally as `<Name>Like`, naming only what the adapter calls. Never import the provider at runtime, and never initialize or close it. Add a typecheck-only `<name>.contracts.ts` that assigns the real SDK to the structural type, so an SDK upgrade that breaks the shape fails the build.

**`open` succeeds or throws before changing anything.**

```ts
import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

type Sdk = { isReady: () => boolean; send: (body: string) => void };

export const example = ({ sdk }: { sdk: Sdk }): AnalyticsAdapter<Sdk> => ({
  name: "example",
  open: () => {
    if (!sdk.isReady()) {
      throw new TraceError({
        code: "NOT_INITIALIZED",
        message: "Example is not set up. Call its init before trace.start().",
      });
    }

    return {
      native: sdk,
      track: (event) => {
        sdk.send(JSON.stringify(event));

        return { status: "submitted", evidence: "sdk-call-returned" };
      },
    };
  },
});
```

The check sits inside `open`, which runs at `trace.start()`, never in the factory: creating the adapter must stay cold even when the SDK is not ready yet. Throw `TraceError` `NOT_INITIALIZED` when the SDK is not set up, or `UNSUPPORTED` when it was configured in a way the adapter cannot honor; the events tracked meanwhile wait in the destination's buffer, and `trace.start()` tries again.

**A session implements an identity method only for something its provider can do with it.** A browser or mobile SDK switches its own identity, so it gets `identify`, `traits`, `group` and `reset`; a server SDK that holds no one between calls updates the profile of the `user` each update names instead, and has no `identify` or `reset` at all, because there is no session identity to switch or to reset. On a per-call provider, an event's identity is read from `event.identity` in `track`, never from a session method. A session without `reset` is never reset, which is right for an SDK that holds nobody between calls.

**Never write an event to provider globals.** No super property, no global tag, registered from `track`. If the SDK can carry data on the one call, use that; if it cannot, list it as a loss.

**Pass what the provider can keep.** `event.id` as its dedup id and `event.timestamp` as its event time, wherever the provider takes them. Where it cannot keep the time, report `{ path: "timestamp", reason: "unsupported" }`.

**Context goes under properties**, properties winning: a context key a property shadows is an `omitted` loss.

**Say what the provider cannot carry.** A `submitted` result lists what it could not express as `losses`, in the order of the event's shape: the name, then properties, then context, then the rest. An event the provider has no notion of at all is `skipped` with `unsupported`, never sent as something it is not.

**Answer, do not throw.** A thrown error is contained and becomes a `failed` outcome, but a returned result says more. When the SDK swallows its own error, answer `failed` with `TraceError` `DELIVERY_FAILED`. An identity method that cannot do this particular update throws `TraceError` `UNSUPPORTED`, which counts as done; a session whose SDK cannot reset at all omits `reset` instead, because a `reset` that throws leaves the applied state unknown.

| Result          | When                                                                                                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submitted`     | The SDK took it. State the evidence, and list what could not be represented.                                                                                                                                                                         |
| `dropped`       | With `provider-filtered`, when the SDK says its own filter discarded it.                                                                                                                                                                             |
| `skipped`       | With `unsupported`, when this provider has no notion of the event; `auth-subject-mismatch`, when an awaited account check failed; or `unidentified`, when a server adapter has neither a signed-in user nor an anonymous id to send the event under. |
| `failed`        | The attempt failed. `error` is what the SDK threw, rejected with or answered, exactly as it was.                                                                                                                                                     |
| `indeterminate` | With `ambiguous`, when you cannot tell whether it went out.                                                                                                                                                                                          |

An answer the contract does not allow is a failure with `TraceError` `INVALID_ANSWER`: an `open` that returns no session with a `track` function fails the start, a result with an unknown status fails the outcome, and a flush that answers anything but `flushed`, `timeout` or `failed` fails the flush.

**Evidence is the weakest the SDK proves.** `sdk-call-returned` says only that the call returned; `sdk-callback-completed` that the SDK's own callback said it finished, which it also does for an event the provider went on to drop; `backend-acknowledged` that a backend answered for this exact event. Never claim more than the evidence backs, and never wait past `timeout` just to claim a stronger one.

**An identity the provider refuses is a failure when sending it anyway would file that user's events under someone else's history** (Heap merges its anonymous history into the next user identified). Throw a failure such as `DELIVERY_FAILED`, never `UNSUPPORTED`, so the lane skips that user's events as `identity-failed` instead of risking them.

**Check the account when you await.** If `track` awaits anything account-dependent, compare `context.currentGeneration()` with `event.identity.generation` afterward, and answer `skipped: auth-subject-mismatch` when they differ.

**Time comes from the context.** An adapter never reads the wall clock: `context.now()` is the Trace's clock, so an age rule such as Mixpanel's five-day window runs on the same clock the event was stamped with, and on a test's clock when one is injected.

**Types before runtime checks.** What the types enforce (required options, a mapping typed from the registry, a value's shape) is not checked again at runtime. Runtime code handles only what arrives at runtime: event data, the provider's own answers, the SDK's state.

**`collection` only for a reversible, non-destructive switch.** One that deletes a profile or cannot be turned back on is left out, and the README says why.

**Text over a provider's limit.** Where the provider cuts over-long text itself, report `truncated` and let it cut. Where the provider refuses over-long text rather than cutting it, cut the text yourself only where a loss can name the path (properties, context); where no loss can name it (an identity update), leave the value out whole and throw `UNSUPPORTED`, so no stored profile value is ever altered silently or partly.

**Every documented limit the adapter can check locally is enforced**, in the provider's own unit, and reported as a loss or a refusal. What the provider's own servers do beyond that is stated as not verified. See [provider limitations](provider-limitations.md).

## Test it

Keep a fake of the SDK beside the adapter, modeled on a named version, and register the shared contract:

```ts
import type { AnalyticsAdapter } from "@priemskiyyy/trace";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

type Beacon = { send: (body: string) => boolean };

const beacon = ({ sdk }: { sdk: Beacon }): AnalyticsAdapter<Beacon> => ({
  name: "beacon",
  open: () => ({
    native: sdk,
    track: () => ({ status: "submitted", evidence: "sdk-call-returned" }),
  }),
});

testAnalyticsAdapter({
  name: "beacon",
  createAdapter: () => beacon({ sdk: { send: () => true } }),
});
```

The suite checks what is provider independent: the adapter names itself and opens on demand, its native handle keeps its identity, an event is answered without throwing and left untouched, `submitted` evidence is one of the three values, `identify`, `traits` and `group` present each complete or throw `UNSUPPORTED`, a present `reset` always completes and a `reset` that throws `UNSUPPORTED` fails the suite outright (an adapter whose SDK cannot reset omits the method instead), `collection` toggles both ways, `flush` answers `flushed`, `timeout` or `failed`, `dispose` completes, and every `open` yields an independent session. It cannot check coldness, how you map each field, or what evidence the provider really gives; those, and a test that proves two concurrent events for different accounts never share state, belong in your own tests. See [application testing](testing.md).

For how a lane opens, buffers and disposes the session around your adapter, see [runtime architecture](internals/architecture.md).
