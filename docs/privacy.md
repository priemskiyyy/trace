---
description: "How Trace redacts keys, bounds size and copies values before an event, a trait or a context is kept, observed or sent, and what happens when redaction itself fails."
---

# Privacy and redaction

Sanitizing happens at the door. An event's properties and context are sanitized when it is tracked, and every trait, group trait and `trace.context()` value when it is set. Nothing unsanitized is ever kept, buffered, handed to an `events` listener, written to diagnostics or passed to an adapter.

```ts
import { isSensitiveKey, Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";

const trace = new Trace({
  events,
  destinations: { console: console() },
  privacy: {
    redact: (key, path) =>
      isSensitiveKey(key) || key === "iban" || path === "traits.email",
    limits: { stringLength: 500 },
  },
});
```

## Redacting by key

`redact(key, path)` is asked about every key, with its dotted path: `properties.card.iban`, `context.session`, `traits.email`, `groups.workspace.billingEmail`. A key it names is removed and recorded as a `redacted` loss at that path, and the event is still delivered without it: you asked for that key never to leave, not for the event to be lost.

```ts
const receipt = trace.track(
  "Search Performed",
  { query: "shoes" },
  { context: { apiKey: "key_123" } },
);
// every destination receives the event without context.apiKey,
// and each submitted outcome lists { path: "context.apiKey", reason: "redacted" }
```

Without configuration, `isSensitiveKey` decides. It matches a key that names a credential anywhere in it, whatever the case or separator: `token`, `authorization`, `password` or `passwd`, `secret`, `cookie`, `credential`, `bearer`, `jwt`, `session_id` or `sessionId`, and `api_key`, `access_key` or `private_key` in any of their spellings. So `cardToken` and `x-api-key` are redacted too.

Your own `redact` replaces the default, so call `isSensitiveKey` from it to keep the defaults, as the example above does. It runs for every key, so keep it synchronous and cheap.

- A key is removed, never masked: no placeholder takes its place, and the loss records where it was.
- Removing a key that `redact` names does not reach a provider either. `trace.traits({ email: null })` is withheld when `redact` names `email`, so clean such a key from a provider through its SDK.
- A schema is never run again on sanitized values, because sanitizing turns a `Date` into a string and a schema's output is not always valid input.

## When redaction fails

Privacy outranks delivery. If `redact` throws, Trace cannot know what it would have removed, so it sends nothing of what it was asked about:

| During             | What happens                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `track`            | The event is dropped as `sanitizer-failed`.                                                            |
| `trace.user()`     | The traits are refused as a whole with the diagnostic `traits refused`, and the user still changes.    |
| `trace.traits()`   | The traits are refused as a whole with the diagnostic `traits refused`, and nothing changes.           |
| `trace.group()`    | The group's traits are refused with the diagnostic `traits refused`, and the membership still applies. |
| `trace.context()`  | Nothing changes, and the diagnostic `context refused` is recorded.                                     |
| `trace.scope()`    | Every event tracked through the scope is dropped as `sanitizer-failed`.                                |
| `defaults.context` | The constructor throws `TraceError` `INVALID_CONFIGURATION`, with the failure as its `cause`.          |

Only the constructor throws, because the defaults are configuration. A `redact` that is not a function is refused by the constructor too.

## Bounds

Every value is bounded, so a huge or hostile object cannot exhaust memory or run past a provider's limits. Change any bound with `privacy.limits`. Each must be a whole number of 0 or more, or the constructor throws.

| Limit          | Default | What it bounds                                                                                         |
| -------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `depth`        | 6       | levels of nested objects and lists, the outermost included                                             |
| `breadth`      | 50      | keys of one object, items of one list, a user's group types, and the losses one part of an event lists |
| `stringLength` | 2000    | characters of any string                                                                               |
| `totalSize`    | 200000  | characters of a whole value once serialized: an event's properties, its context, a user's traits       |

What a bound cuts is a `truncated` loss at its path, and the event is still delivered. Each part of an event, its properties, its context, the traits and each group type, lists at most `breadth` losses, and one `truncated` loss at that part stands for the rest. A trait value past what is left of `totalSize` is cut, or left out when none of it fits, in which case the trait keeps its previous value. Each cut is reported, and no other trait is removed to make room.

## Values that are not plain data

Trace copies data without running any of it. It reads each property through its descriptor, so no getter, setter or `toJSON` ever runs.

| Value                                                          | Becomes                       | Loss          |
| -------------------------------------------------------------- | ----------------------------- | ------------- |
| a `Date`                                                       | its ISO string                | `coerced`     |
| an invalid `Date`                                              | removed                       | `invalid`     |
| a `bigint`                                                     | its decimal string            | `coerced`     |
| `NaN`, an infinity, a function or a symbol                     | removed                       | `invalid`     |
| a property defined by a getter                                 | removed                       | `omitted`     |
| `undefined`                                                    | left out, or `null` in a list | none          |
| a `Map`, a `Set`, a class instance or another non-plain object | removed                       | `unsupported` |
| a reference back to an object that contains it                 | cut where it loops            | `truncated`   |
| a key named `__proto__`, `constructor` or `prototype`          | skipped                       | `omitted`     |
| an object that cannot be read, such as a revoked proxy         | removed                       | `invalid`     |

Inside a list, a removed item becomes `null`, so the other items keep their places. A key given as `undefined` is absent, as if it were not there, and leaves no loss, and an `undefined` item or a hole in a list becomes `null` with no loss, as in JSON. A key defined by a getter is an `omitted` loss at any depth, the top of a trait, a group trait or a context layer included, where the loss rides on every event the key would have ridden. What is left is deep-frozen, and every destination and listener receives the same frozen object, so no adapter can change what another one sees or recover what redaction removed.

## Diagnostics carry no values

A diagnostic event carries ids, names, reasons, counts and the paths of what was lost, never properties, context, trait values or a provider's error, whose message may quote configuration. The snapshot that `trace.diagnostics.get()` answers carries the current user's id, which your application set, and each destination's state alone. A failed destination's error, what its `open` threw, can quote the SDK's configuration, so it stays on `trace.destination(name).status`: read it there, and never forward it unfiltered. See [diagnostics and devtools](devtools.md).

## What Trace cannot protect

Calls you make on a provider SDK directly, including through `trace.destination(name).native`, bypass all of this. So does whatever the provider collects by itself, such as autocapture, page views and session replay: configure that in the SDK. See [native access](native-access.md).
