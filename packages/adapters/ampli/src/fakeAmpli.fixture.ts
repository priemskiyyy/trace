import type { Identify, Types } from "@amplitude/analytics-browser";

import type { IdentityPlugin } from "src/types/IdentityPlugin";

type Upload = {
  event: Types.BaseEvent;
  options: Types.EventOptions | undefined;
  resolve: (result: Types.Result) => void;
};

const answerNothing = () => ({ promise: Promise.resolve() });

/**
 * The generated Ampli browser wrapper for the tests, modelled on
 * `ampli-v2-generated.ts` (Ampli Build 1.0.0) over
 * `@amplitude/analytics-browser` 2.45.10, with every value typed as the SDK
 * types it. It proves how the adapter drives the wrapper's calls and quirks:
 * - `isLoaded` is false until `load`, and a read of `client` before `load` is
 *   counted, because the real wrapper logs an error;
 * - the client holds no device until the `init` that `load` starts has
 *   finished;
 * - an unloaded or disabled wrapper's `track` and `identify` send nothing and
 *   answer nothing, while its `client` still works;
 * - an upload waits until the test completes it with a result code, and an
 *   opted-out event answers code 0 at once;
 * - `client.flush()` resolves at once without waiting for uploads in flight;
 * - a call gets its user and device when Amplitude's timeline processes it,
 *   one queued call per macrotask, the call's own options winning, and then
 *   passes through every plugin `client.add` set up, in order, which is how
 *   a user switch can file an earlier event under the next user unless a
 *   plugin pins it; `drained()` settles once the timeline has processed every
 *   call queued so far.
 *
 * Like the SDK, it never rejects. It does not prove the network, the upload
 * queue, batching, retries or persistence, or the codes a real backend
 * answers. `ampli.sdk.test.ts` checks the upload path, its result codes and
 * when a call gets its user and device against the real SDK over a stubbed
 * `fetch`.
 */
export const fakeAmpli = ({ loaded = true }: { loaded?: boolean } = {}) => {
  const state: {
    loaded: boolean;
    disabled: boolean;
    userId: string | undefined;
    deviceId: string | undefined;
    optOut: boolean;
  } = {
    loaded,
    disabled: false,
    userId: undefined,
    deviceId: loaded ? "device-1" : undefined,
    optOut: false,
  };

  const calls: {
    load: number;
    isLoaded: number;
    identify: {
      userId: string | undefined;
      properties: object | undefined;
      options: Types.EventOptions | undefined;
    }[];
    track: {
      event: Types.BaseEvent;
      options: Types.EventOptions | undefined;
    }[];
    client: {
      beforeLoad: number;
      init: number;
      identify: {
        identify: Identify;
        options: Types.EventOptions | undefined;
      }[];
      add: string[];
      reset: number;
      setOptOut: boolean[];
      flush: number;
    };
  } = {
    load: 0,
    isLoaded: 0,
    identify: [],
    track: [],
    client: {
      beforeLoad: 0,
      init: 0,
      identify: [],
      add: [],
      reset: 0,
      setOptOut: [],
      flush: 0,
    },
  };

  const uploads: Upload[] = [];
  const plugins: IdentityPlugin[] = [];
  const drains: (() => void)[] = [];
  let applying = false;

  const timeline: {
    event: Types.BaseEvent;
    options: Types.EventOptions | undefined;
  }[] = [];

  const processed: {
    event_type: string;
    user_id: string | undefined;
    device_id: string | undefined;
  }[] = [];

  let devices = loaded ? 1 : 0;

  const startDevice = () => {
    devices += 1;
    state.deviceId = `device-${devices}`;
  };

  const apply = async ({
    event,
    options,
  }: {
    event: Types.BaseEvent;
    options: Types.EventOptions | undefined;
  }) => {
    let enriched: Types.BaseEvent = {
      ...(state.userId === undefined ? {} : { user_id: state.userId }),
      ...(state.deviceId === undefined ? {} : { device_id: state.deviceId }),
      ...event,
      ...options,
    };

    for (const plugin of plugins) {
      enriched = await plugin.execute({ ...enriched });
    }

    processed.push({
      event_type: enriched.event_type,
      user_id: enriched.user_id,
      device_id: enriched.device_id,
    });
  };

  const scheduleApply = () => {
    if (applying) {
      return;
    }

    applying = true;
    setTimeout(() => {
      const queued = timeline.shift();

      (queued === undefined ? Promise.resolve() : apply(queued)).then(() => {
        applying = false;

        if (timeline.length > 0) {
          scheduleApply();

          return;
        }

        for (const drain of drains.splice(0)) {
          drain();
        }
      });
    }, 0);
  };

  const upload = (event: Types.BaseEvent, options?: Types.EventOptions) => {
    if (state.optOut) {
      return {
        promise: Promise.resolve({
          event,
          code: 0,
          message: "Event skipped due to optOut config",
        }),
      };
    }

    timeline.push({ event, options });
    scheduleApply();

    return {
      promise: new Promise<Types.Result>((resolve) => {
        uploads.push({ event, options, resolve });
      }),
    };
  };

  const client = {
    init: () => {
      calls.client.init += 1;

      return {
        promise: Promise.resolve().then(() => {
          if (state.deviceId === undefined) {
            startDevice();
          }
        }),
      };
    },
    identify(identify: Identify, options?: Types.EventOptions) {
      calls.client.identify.push({ identify, options });

      if (options?.user_id !== undefined) {
        state.userId = options.user_id;
      }

      if (options?.device_id !== undefined) {
        state.deviceId = options.device_id;
      }

      return upload({ event_type: "$identify" }, options);
    },
    getDeviceId: () => state.deviceId,
    add: (plugin: IdentityPlugin) => {
      calls.client.add.push(plugin.name);
      plugins.push(plugin);

      return { promise: plugin.setup() };
    },
    reset: () => {
      calls.client.reset += 1;
      state.userId = undefined;
      startDevice();
    },
    setOptOut: (optOut: boolean) => {
      calls.client.setOptOut.push(optOut);
      state.optOut = optOut;
    },
    flush: () => {
      calls.client.flush += 1;

      return answerNothing();
    },
  };

  const isSending = () => state.loaded && !state.disabled;

  const sdk = {
    get isLoaded() {
      calls.isLoaded += 1;

      return state.loaded;
    },
    get client() {
      if (!state.loaded) {
        calls.client.beforeLoad += 1;
      }

      return client;
    },
    load: (options: { environment?: string; disabled?: boolean }) => {
      calls.load += 1;
      state.loaded = true;
      state.disabled = options.disabled ?? false;

      return client.init();
    },
    identify(
      userId: string | undefined,
      properties?: object,
      options?: Types.EventOptions,
    ): { promise: Promise<Types.Result | void> } {
      calls.identify.push({ userId, properties, options });

      if (!isSending()) {
        return answerNothing();
      }

      const pinned =
        userId === undefined || userId === ""
          ? options
          : { ...options, user_id: userId };

      if (pinned?.user_id !== undefined) {
        state.userId = pinned.user_id;
      }

      if (pinned?.device_id !== undefined) {
        state.deviceId = pinned.device_id;
      }

      return upload({ event_type: "$identify" }, pinned);
    },
    track: (
      event: Types.BaseEvent,
      options?: Types.EventOptions,
    ): { promise: Promise<Types.Result | void> } => {
      calls.track.push({ event, options });

      if (!isSending()) {
        return answerNothing();
      }

      return upload(event, options);
    },
  };

  return {
    sdk,
    state,
    calls,
    uploads,
    processed,
    drained: () =>
      new Promise<void>((resolve) => {
        if (timeline.length === 0 && !applying) {
          resolve();

          return;
        }

        drains.push(resolve);
      }),
    completeUploads: ({
      code = 200,
      count = uploads.length,
    }: { code?: number; count?: number } = {}) => {
      for (const { event, resolve } of uploads.splice(0, count)) {
        resolve({
          event,
          code,
          message: code === 200 ? "Event tracked successfully" : "Failed",
        });
      }
    },
  };
};
