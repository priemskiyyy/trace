type Payload = Record<string, unknown>;

type PageView = {
  website: string;
  hostname: string;
  language: string;
  referrer: string;
  screen: string;
  title: string;
  url: string;
};

type SentRequest = { type: "event" | "identify"; payload: Payload };

const WEBSITE_ID = "b59e9c65-ae32-47f1-8400-119fcf4861c4";

// JSON leaves out a key whose value is undefined, as the tracker's request body does.
const getSentPayload = (payload: object): Payload =>
  Object.fromEntries(
    Object.entries(payload).flatMap(([key, value]: [string, unknown]) => {
      if (value === undefined) {
        return [];
      }

      return [[key, value]];
    }),
  );

/**
 * `window.umami` for the tests, modelled on the Umami tracker 3.4.0. `track`
 * takes each of its forms: nothing for a page view, a name, a name and data, a
 * payload, or a function of the page's own payload, which carries the distinct
 * id `identify` set for the page. It sends nothing while tracking is
 * disabled, as the `umami.disabled` flag does, and resolves either way, after
 * a failed request too; `failing` makes it reject, as a throwing `before-send`
 * function does. It counts `identify`, which Trace must never call. It proves
 * the payload the adapter builds; it does not model Umami's server, which
 * cuts, rounds and flattens event data.
 */
export const fakeUmami = () => {
  const state: {
    identity: string | undefined;
    disabled: boolean;
    failing: boolean;
  } = { identity: undefined, disabled: false, failing: false };

  const sent: SentRequest[] = [];
  const calls = { track: 0, identify: 0 };

  const getPageView = (): PageView & {
    tag: undefined;
    id: string | undefined;
  } => ({
    website: WEBSITE_ID,
    hostname: "shop.example",
    language: "en-US",
    referrer: "",
    screen: "1280x720",
    title: "Boutique",
    url: "https://shop.example/cart",
    tag: undefined,
    id: state.identity,
  });

  const send = (payload: object, type: SentRequest["type"]) => {
    if (state.failing) {
      return Promise.reject(new Error("before-send failed"));
    }

    if (!state.disabled) {
      sent.push({ type, payload: getSentPayload(payload) });
    }

    return Promise.resolve();
  };

  const sdk = {
    track: (
      event?: string | object | ((payload: PageView) => object),
      data?: object,
    ) => {
      calls.track += 1;

      if (typeof event === "string") {
        return send({ ...getPageView(), name: event, data }, "event");
      }

      if (typeof event === "function") {
        return send(event(getPageView()), "event");
      }

      if (event === undefined) {
        return send(getPageView(), "event");
      }

      return send({ ...event }, "event");
    },
    identify: (id: string | object, data?: object) => {
      calls.identify += 1;

      if (typeof id === "string") {
        state.identity = id;
      }

      return send({ ...getPageView(), data }, "identify");
    },
  };

  return { sdk, state, sent, calls };
};
