---
description: "Trace on React Native and Expo: the same core and React bindings, the React Native adapters for PostHog, Firebase, Mixpanel and Segment, flushing in the background, and Hermes."
---

# React Native and Expo

The core, the React bindings, the HTTP adapter and the console adapter are the same packages on every platform: `@priemskiyyy/trace-react` works in the browser and in React Native alike. Amplitude's browser and React Native SDKs share one API, so `@priemskiyyy/trace-amplitude` serves both. PostHog, Firebase and Mixpanel have a React Native SDK with its own API, so each has its own package, with a factory of the same name as the web one; Segment's React Native client is different enough that it also has its own package.

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { posthog } from "@priemskiyyy/trace-posthog-react-native";
import PostHog from "posthog-react-native";

const client = new PostHog("phc_project_api_key", { defaultOptIn: false });

export const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: { research: posthog({ sdk: client }) },
  consent: { research: ["analytics"] },
});

trace.start();
```

| Provider                    | React Native package                                         |
| --------------------------- | ------------------------------------------------------------ |
| Amplitude                   | `@priemskiyyy/trace-amplitude` (same package as the browser) |
| PostHog                     | `@priemskiyyy/trace-posthog-react-native`                    |
| Firebase (Google Analytics) | `@priemskiyyy/trace-firebase-react-native`                   |
| Mixpanel                    | `@priemskiyyy/trace-mixpanel-react-native`                   |
| Segment                     | `@priemskiyyy/trace-segment-react-native`                    |
| HTTP, Console               | the same packages as the browser                             |

See [choose an adapter](adapters.md) for every option, and each provider's page under [Destinations](adapters.md) for its identity, consent and flush rules on this platform.

## Initialization is still yours

Trace never creates, initializes or closes a React Native SDK. React Native Firebase initializes itself from your platform configuration files at launch; the other clients are constructed and initialized in your own code, exactly as on the web, and passed to the adapter's `sdk` option. Segment's client needs time to become ready and running before it can be used: its destination's `open` fails with `NOT_INITIALIZED` until then, and its page shows how to call `trace.start()` again from `client.running.onChange`. PostHog's client needs no such restart: `open` only fails with `UNSUPPORTED` for a disabled client, and every session method waits for the client's storage to load on its own, one call at a time, rather than the destination's start waiting for it.

## Flush in the background

An app that goes to the background may be suspended at any moment. Amplitude, PostHog and Segment on React Native have a `flush`; the other adapters have none, so `trace.flush()` only waits for their submissions in flight:

```ts
import { AppState } from "react-native";

const subscription = AppState.addEventListener("change", (state) => {
  if (state === "background") {
    trace.flush({ timeout: 1500 });
  }
});
```

## Hermes

Hermes has no `crypto.randomUUID`, so an event's id falls back to `Math.random`; see [installation](installation.md). It also has no `TextEncoder` on older engines, which `@priemskiyyy/trace-mixpanel-react-native` and `@priemskiyyy/trace-segment-react-native` need: use React Native 0.74 or later, where Hermes provides one.

## Screen views

There is no hook or adapter method that tracks on navigation. Track a screen view from your router's own state listener, calling `trace.track` from inside it, never from a component body:

```ts
import { console } from "@priemskiyyy/trace-console";
import { Trace, event } from "@priemskiyyy/trace";

const trace = new Trace({
  events: { "Screen Viewed": event<{ name: string }>() },
  destinations: { console: console() },
});

// However your router exposes its ref: React Navigation's
// NavigationContainerRef, or Expo Router's usePathname in a listener.
declare const navigationRef: {
  addListener: (event: "state", handler: () => void) => () => void;
  getCurrentRouteName: () => string | undefined;
};

navigationRef.addListener("state", () => {
  const name = navigationRef.getCurrentRouteName();

  if (name !== undefined) {
    trace.track("Screen Viewed", { name });
  }
});
```

Attach the listener once, outside any component's render, such as where you create the Trace or the navigation container. Expo Router exposes its current path through its own hooks; read it in an effect keyed on the path, not in the component body that renders the screen.

## Expo

The Trace packages are plain JavaScript and need no config plugin. Your provider SDK does. React Native Firebase and Segment need their native modules, so they need a development build, not Expo Go; PostHog's client works in Expo Go over its JavaScript bridge. Mixpanel's client falls back to JavaScript mode without its native module, where its `reset()` race applies; see [Mixpanel](adapters/mixpanel.md).

## What has been verified

Every React Native adapter is tested against a fake that is typechecked against the real SDK's declarations, and a real-SDK test where the SDK can run in Node or jsdom. None has been run on a device or a simulator in this repository. See the [verification matrix](verification.md).
