// Names a documentation example may use without declaring them. They stand
// for the reader's own application and for provider SDKs the reader installs.
import type {
  AnalyticsAdapter,
  EventDefinition,
  Trace,
  TraceSchema,
} from "@priemskiyyy/trace";
import type { ConsoleWriter } from "@priemskiyyy/trace-console";
import type { HttpAdapterOptions } from "@priemskiyyy/trace-http";
import type { FirebaseOptions } from "firebase/app";
import type { PostHog } from "posthog-js";
import type { ReactNode } from "react";

type CheckoutStartedProperties = {
  cart: { id: string };
  value: number;
  currency: "EUR" | "USD";
};

declare global {
  /** The Boutique tracking plan most examples declare or extend. */
  const events: {
    "App Opened": EventDefinition<undefined, Record<string, never>>;
    "Checkout Started": EventDefinition<
      CheckoutStartedProperties,
      CheckoutStartedProperties
    >;
    "Search Performed": EventDefinition<{ query: string }, { query: string }>;
  };
  /** The application's Trace, with the destinations most examples route to. */
  const trace: Trace<
    typeof events,
    {
      research: AnalyticsAdapter<PostHog>;
      backend: AnalyticsAdapter<HttpAdapterOptions["request"]>;
      console: AnalyticsAdapter<ConsoleWriter>;
    },
    TraceSchema,
    "analytics"
  >;
  /** The application's own client call that sends one event to its backend. */
  const sendEvent: HttpAdapterOptions["request"];
  const restoreSession: () => Promise<{ user: { id: string } } | null>;
  const showOfflineBanner: () => void;
  const Application: () => ReactNode;
  const respond: (request: Request) => Promise<Response>;
  const session: {
    token: string;
    getToken: () => Promise<string>;
    user: { id: string; email: string };
  };
  const firebaseConfig: FirebaseOptions;
}

// verify-snippets.mjs appends the Register merge below this file's content:
// declaration merging needs an interface, which ESLint bans outside a
// binding's own Register.ts, so the generated copy carries it instead.
