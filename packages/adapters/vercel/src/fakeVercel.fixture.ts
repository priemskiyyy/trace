type Properties = Record<string, unknown>;

type QueuedEvent = {
  name: string;
  data?: Properties;
  options: { flags?: unknown } | undefined;
};

const SERVER_ERROR =
  "[Vercel Web Analytics] Please import `track` from `@vercel/analytics/server` when using this function in a server environment";

/**
 * `@vercel/analytics` 2.0.1 for the tests, with the queue Vercel's script
 * reads. Outside a browser `track` throws in development and test and only
 * warns in production. Before `inject` has installed `window.va` it does
 * nothing. In development it drops a whole event that carries an object, and
 * in production it strips the object from the event. `queue` holds what
 * `window.vaq` would. It counts `inject` and `pageview`, which Trace must
 * never call. It proves the calls the adapter makes; the real SDK in jsdom
 * proves the queue.
 */
export const fakeVercel = ({
  browser = true,
  mode = "production",
  injected = true,
}: {
  browser?: boolean;
  mode?: "development" | "production";
  injected?: boolean;
} = {}) => {
  const state = { browser, mode, injected };
  const queue: ["event", QueuedEvent][] = [];

  const calls: {
    track: [name: string, properties: Properties | undefined][];
    inject: number;
    pageview: number;
  } = { track: [], inject: 0, pageview: 0 };

  const sdk = {
    track: (
      name: string,
      properties?: Properties,
      options?: { flags?: unknown },
    ) => {
      calls.track.push([name, properties]);

      if (!state.browser && state.mode === "development") {
        throw new Error(SERVER_ERROR);
      }

      if (!state.browser || !state.injected) {
        return;
      }

      if (properties === undefined) {
        queue.push(["event", { name, options }]);

        return;
      }

      const flat = Object.entries(properties).flatMap(
        ([key, value]): [string, unknown][] => {
          if (typeof value === "object" && value !== null) {
            return [];
          }

          return [[key, value]];
        },
      );

      const hasObject = flat.length < Object.keys(properties).length;

      if (hasObject && state.mode === "development") {
        return;
      }

      queue.push(["event", { name, data: Object.fromEntries(flat), options }]);
    },
    inject: () => {
      calls.inject += 1;
      state.injected = true;
    },
    pageview: () => {
      calls.pageview += 1;
    },
  };

  return { sdk, state, queue, calls };
};
