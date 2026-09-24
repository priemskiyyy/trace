---
description: "Trace is typed, provider-independent product analytics for TypeScript: events declared once, identity that stays right while providers start, consent that gates delivery, and receipts that say what happened."
---

# What Trace is

Trace is a product analytics library for web, React Native and server applications. You declare your events once, track them through one small API, and configuration decides which analytics providers receive them.

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";

const trace = new Trace({
  events: {
    "App Opened": event(),
    "Search Performed": event<{ query: string }>(),
  },
  destinations: { console: console() },
});

trace.start();
trace.user({ id: "user_42" });
trace.track("Search Performed", { query: "shoes" });
```

Renaming `analytics.track` would not be worth a library. What Trace owns is everything around the call:

- **Typed events.** One registry declares every event and its properties, optionally with a Standard Schema validator. A misspelled name or a missing property is a compile error, and an event its schema refuses is dropped before any provider sees it.
- **Identity.** Changing the user starts a new identity generation. An event keeps the user it was tracked with, a provider that holds a user is reset before the next one is identified, and what the previous user left waiting is dropped instead of sent under the next one.
- **Consent.** Purposes gate destinations. A gated destination receives nothing until every purpose it needs is granted, and where its SDK has a reversible switch, its own collection is off while they are not.
- **Privacy.** Redaction and size limits run before anything is kept, buffered, observed or sent.
- **Routing.** Destinations have typed names, one event can go to several providers, and one destination's failure never affects another.
- **Honest receipts.** Every event answers what happened at each destination, and on what evidence.

## The guarantee, and where it ends

Trace guarantees how an event is declared, validated, sanitized, given its identity, gated by consent, routed and handed to each destination. It does not claim that a provider stored, processed or displayed an event unless that destination gives evidence for that exact boundary. Most SDKs only prove that their call returned, and the receipt says exactly that.

A provider can still file an event differently from how Trace handed it over: an SDK that stamps the user when it uploads, rather than when it is called, can give an anonymous event to whoever signed in meanwhile. Each adapter's page says where its provider falls short, and [provider limitations](provider-limitations.md) collects them.

## What Trace is not

Trace is not a tag manager, a customer data platform, a consent management platform or an SDK loader. It never initializes, configures or closes a provider SDK: your application does, and Trace only calls it. Autocapture, page views, session replay, feature flags and dashboards stay with your provider, outside Trace's consent, privacy and receipts. Trace does not batch, retry or store events offline either. The SDKs do that, and your own client does it for your backend.

## Where to go next

- [Getting started](getting-started.md) builds a working setup in a few minutes.
- [The mental model](mental-model.md) follows an event from `track` to each provider.
- [Choose an adapter](adapters.md) compares what each provider can honestly do.
- [Example applications](examples.md) shows every event's journey inside one shop.
