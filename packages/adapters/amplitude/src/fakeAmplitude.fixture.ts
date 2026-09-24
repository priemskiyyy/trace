import type { Types } from "@amplitude/analytics-browser";

import type { IdentityPlugin } from "src/types/IdentityPlugin";

type UserProperties = ReturnType<Types.IIdentify["getUserProperties"]>;

type Queued = {
  event: Types.BaseEvent;
  resolve: (result: Types.Result) => void;
};

/**
 * `@amplitude/analytics-browser` 2.45.10 and `@amplitude/analytics-react-native`
 * 1.10.0 for the tests, on analytics core 2.56 and 2.57, with every member the
 * adapter calls typed as the real SDK types it. Each call builds the event the
 * SDK builds and answers at once, while the event waits in a timeline until
 * `process()`, as the SDK's waits for its next timer: only then is it given the
 * user and device Amplitude holds, the caller's options winning, then passed
 * through every plugin added, in order, and uploaded without its `extra`, as
 * Amplitude's destination strips it, with the code in `state.code`. `add`
 * sets a plugin up at once, or at `init` when it came before it, and `remove`
 * and every later `init` tear plugins down and take them out, as Amplitude's
 * do, while the calls they held wait on. Nothing is processed before `init`,
 * `identify` also moves Amplitude to the user and device its options name,
 * `reset` starts a new device, an opted-out call resolves at once with code
 * 0, and `flush` resolves at once while the uploads still wait, as the SDK's
 * does while an earlier upload is in flight.
 *
 * It proves which calls the adapter makes, with which arguments, and the user
 * and device each processed event carries once the plugin has run. It does
 * not prove what Amplitude accepts: user properties are the business of the
 * SDK's own `Identify`, which the tests pass in, and nothing is uploaded
 * anywhere. The React Native SDK fills in the user and device only after a
 * native call, which the fake does not wait for.
 */
export const fakeAmplitude = ({
  initialized = true,
}: { initialized?: boolean } = {}) => {
  const state: {
    initialized: boolean;
    userId: string | undefined;
    deviceId: string | undefined;
    optOut: boolean;
    code: number;
  } = {
    initialized,
    userId: undefined,
    deviceId: initialized ? "device-1" : undefined,
    optOut: false,
    code: 200,
  };

  const calls: {
    init: number;
    shutdown: number;
    add: string[];
    remove: string[];
    getDeviceId: number;
    track: {
      eventInput: string | Types.BaseEvent;
      eventProperties: Record<string, unknown> | undefined;
      eventOptions: Types.EventOptions | undefined;
    }[];
    setUserId: (string | undefined)[];
    identify: {
      userProperties: UserProperties;
      eventOptions: Types.EventOptions | undefined;
    }[];
    setGroup: {
      groupType: string;
      groupName: string | string[];
      eventOptions: Types.EventOptions | undefined;
    }[];
    groupIdentify: {
      groupType: string;
      groupName: string | string[];
      groupProperties: UserProperties;
      eventOptions: Types.EventOptions | undefined;
    }[];
    reset: number;
    setOptOut: boolean[];
    flush: number;
  } = {
    init: 0,
    shutdown: 0,
    add: [],
    remove: [],
    getDeviceId: 0,
    track: [],
    setUserId: [],
    identify: [],
    setGroup: [],
    groupIdentify: [],
    reset: 0,
    setOptOut: [],
    flush: 0,
  };

  const timeline: Queued[] = [];
  const waitingPlugins: IdentityPlugin[] = [];
  const plugins: IdentityPlugin[] = [];
  const uploaded: Types.BaseEvent[] = [];
  let devices = initialized ? 1 : 0;

  const dispatch = (
    event: Types.BaseEvent,
  ): Types.AmplitudeReturn<Types.Result> => ({
    promise: new Promise((resolve) => {
      if (state.optOut) {
        resolve({
          event,
          code: 0,
          message: "Event skipped due to optOut config",
        });

        return;
      }

      timeline.push({ event, resolve });
    }),
  });

  const startDevice = () => {
    devices += 1;
    state.deviceId = `device-${devices}`;
  };

  const install = (plugin: IdentityPlugin) => {
    plugins.push(plugin);

    return plugin.setup();
  };

  const sdk = {
    init: (): Types.AmplitudeReturn<void> => {
      calls.init += 1;
      state.initialized = true;

      if (state.deviceId === undefined) {
        startDevice();
      }

      const removed = plugins.splice(0).map((plugin) => plugin.teardown());

      return {
        promise: Promise.all([
          ...removed,
          ...waitingPlugins.splice(0).map(install),
        ]).then(() => {}),
      };
    },
    add: (plugin: IdentityPlugin): Types.AmplitudeReturn<void> => {
      calls.add.push(plugin.name);

      if (!state.initialized) {
        waitingPlugins.push(plugin);

        return { promise: Promise.resolve() };
      }

      return { promise: install(plugin) };
    },
    remove: (pluginName: string): Types.AmplitudeReturn<void> => {
      calls.remove.push(pluginName);

      const index = plugins.findIndex(({ name }) => name === pluginName);
      const removed = index === -1 ? [] : plugins.splice(index, 1);

      return {
        promise: Promise.all(removed.map((plugin) => plugin.teardown())).then(
          () => {},
        ),
      };
    },
    shutdown: () => {
      calls.shutdown += 1;
    },
    track: (
      eventInput: string | Types.BaseEvent,
      eventProperties?: Record<string, unknown>,
      eventOptions?: Types.EventOptions,
    ) => {
      calls.track.push({ eventInput, eventProperties, eventOptions });

      return dispatch({
        ...(typeof eventInput === "string"
          ? { event_type: eventInput }
          : eventInput),
        ...eventOptions,
        ...(eventProperties === undefined
          ? {}
          : { event_properties: eventProperties }),
      });
    },
    getDeviceId: () => {
      calls.getDeviceId += 1;

      return state.deviceId;
    },
    setUserId: (userId: string | undefined) => {
      calls.setUserId.push(userId);
      state.userId = userId;
    },
    identify: (
      identify: Types.IIdentify,
      eventOptions?: Types.EventOptions,
    ) => {
      const userProperties = identify.getUserProperties();

      calls.identify.push({ userProperties, eventOptions });

      if (eventOptions?.user_id !== undefined) {
        state.userId = eventOptions.user_id;
      }

      if (eventOptions?.device_id !== undefined) {
        state.deviceId = eventOptions.device_id;
      }

      return dispatch({
        ...eventOptions,
        event_type: "$identify",
        user_properties: userProperties,
      });
    },
    setGroup: (
      groupType: string,
      groupName: string | string[],
      eventOptions?: Types.EventOptions,
    ) => {
      calls.setGroup.push({ groupType, groupName, eventOptions });

      return dispatch({
        ...eventOptions,
        event_type: "$identify",
        user_properties: { $set: { [groupType]: groupName } },
        groups: { [groupType]: groupName },
      });
    },
    groupIdentify: (
      groupType: string,
      groupName: string | string[],
      identify: Types.IIdentify,
      eventOptions?: Types.EventOptions,
    ) => {
      const groupProperties = identify.getUserProperties();

      calls.groupIdentify.push({
        groupType,
        groupName,
        groupProperties,
        eventOptions,
      });

      return dispatch({
        ...eventOptions,
        event_type: "$groupidentify",
        group_properties: groupProperties,
        groups: { [groupType]: groupName },
      });
    },
    reset: () => {
      calls.reset += 1;
      startDevice();
      state.userId = undefined;
    },
    setOptOut: (optOut: boolean) => {
      calls.setOptOut.push(optOut);
      state.optOut = optOut;
    },
    flush: (): Types.AmplitudeReturn<void> => {
      calls.flush += 1;

      return { promise: Promise.resolve() };
    },
  };

  const process = async () => {
    if (!state.initialized) {
      return;
    }

    for (const { event, resolve } of timeline.splice(0)) {
      let processed: Types.BaseEvent = {
        ...(state.userId === undefined ? {} : { user_id: state.userId }),
        ...(state.deviceId === undefined ? {} : { device_id: state.deviceId }),
        time: 0,
        insert_id: `generated-${uploaded.length + 1}`,
        ...event,
      };

      for (const plugin of plugins) {
        processed = await plugin.execute({ ...processed });
      }

      const uploading = { ...processed };

      delete uploading.extra;
      uploaded.push(uploading);
      resolve({
        event: processed,
        code: state.code,
        message: state.code === 200 ? "Event tracked successfully" : "refused",
      });
    }
  };

  return { sdk, state, calls, uploaded, process };
};
