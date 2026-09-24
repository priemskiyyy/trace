type Props = Record<string, string>;

type Result = { status: number } | { error: unknown };

type Options = {
  props?: Props;
  interactive?: boolean;
  revenue?: { amount: number | string; currency: string };
  callback?: (result?: Result) => void;
  url?: string;
};

type SentRequest = { n: string; d: string; p: Props };

/**
 * `@plausible-analytics/tracker` 0.4.6 for the tests. `track` throws before
 * `init`. When it ignores an event, as it does for the `plausible_ignore`
 * flag, localhost, automated browsers and a `transformRequest` that drops it,
 * it answers `callback` with nothing. Otherwise it sends one request, merging
 * its `customProperties` under the event's props, and answers once that
 * request completes: with the response's status, or with the network error.
 * Without `fetch` it never answers. `hold` keeps each answer until the test
 * runs it. It proves how the adapter reads the callback; the real tracker in
 * jsdom proves the request.
 */
export const fakePlausible = ({
  initialized = true,
  hold = false,
}: { initialized?: boolean; hold?: boolean } = {}) => {
  const state: {
    initialized: boolean;
    ignored: boolean;
    fetch: boolean;
    customProperties: Props;
    answer: Result;
  } = {
    initialized,
    ignored: false,
    fetch: true,
    customProperties: {},
    answer: { status: 202 },
  };

  const requests: SentRequest[] = [];
  const answers: Array<() => void> = [];

  const calls: { init: number; track: [name: string, options: Options][] } = {
    init: 0,
    track: [],
  };

  const sdk = {
    init: () => {
      calls.init += 1;

      if (state.initialized) {
        throw new Error("plausible.init() can only be called once");
      }

      state.initialized = true;
    },
    track: (name: string, options: Options) => {
      calls.track.push([name, options]);

      if (!state.initialized) {
        throw new Error(
          "plausible.track() can only be called after plausible.init()",
        );
      }

      if (state.ignored) {
        options.callback?.();

        return;
      }

      requests.push({
        n: name,
        d: "example.com",
        p: { ...state.customProperties, ...options.props },
      });

      if (!state.fetch) {
        return;
      }

      const { answer } = state;

      const handleResponse = () => {
        options.callback?.(answer);
      };

      if (hold) {
        answers.push(handleResponse);

        return;
      }

      queueMicrotask(handleResponse);
    },
  };

  return { sdk, state, requests, answers, calls };
};
