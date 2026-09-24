import type { Types } from "@amplitude/analytics-node";

type Queued = {
  event: Types.BaseEvent;
  resolve: (result: Types.Result) => void;
};

/**
 * The Amplitude Node SDK for the tests, `@amplitude/analytics-node` 1.5.73 on
 * analytics core 2.57.0, with every member the adapter calls typed as the real
 * SDK types it. Each call builds the event the SDK builds and answers at once,
 * while the event waits until the test calls `upload(code)`: then every
 * waiting event is processed as the SDK's context plugin does, its own `time`
 * and `insert_id` given way to the call's, with no user and no device filled
 * in, and each call settles with that code. Nothing is processed before
 * `init`, and `flush` answers at once while the uploads still wait, as the
 * SDK's does while an earlier upload is in flight. `calls` records every call
 * in order with its arguments, an `Identify` as the user properties it holds,
 * `init` included.
 *
 * It proves which calls the adapter makes, with which ids, and what the SDK
 * would upload for them. It does not prove what Amplitude accepts: user
 * properties are the business of the SDK's own `Identify`, which the tests
 * pass in, and nothing is uploaded anywhere; `amplitude.sdk.test.ts` runs the
 * real SDK for its timeline, its upload and its flush.
 */
export const fakeAmplitude = ({
  initialized = true,
}: { initialized?: boolean } = {}) => {
  const state = { initialized };

  const calls: [method: string, ...parameters: unknown[]][] = [];
  const timeline: Queued[] = [];
  const uploaded: Types.BaseEvent[] = [];

  const dispatch = (
    event: Types.BaseEvent,
  ): Types.AmplitudeReturn<Types.Result> => ({
    promise: new Promise((resolve) => {
      timeline.push({ event, resolve });
    }),
  });

  const upload = (code = 200) => {
    if (!state.initialized) {
      return;
    }

    for (const { event, resolve } of timeline.splice(0)) {
      const processed = {
        time: 0,
        insert_id: `generated-${uploaded.length + 1}`,
        ...event,
        event_id: uploaded.length,
        library: "amplitude-node-ts/1.5.73",
      };

      uploaded.push(processed);
      resolve({
        event: processed,
        code,
        message: code === 200 ? "Event tracked successfully" : "failed",
      });
    }
  };

  const sdk = {
    init: (): Types.AmplitudeReturn<void> => {
      calls.push(["init"]);
      state.initialized = true;

      return { promise: Promise.resolve() };
    },
    track: (
      eventInput: string | Types.BaseEvent,
      eventProperties?: Record<string, unknown>,
      eventOptions?: Types.EventOptions,
    ) => {
      calls.push(["track", eventInput, eventProperties, eventOptions]);

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
    identify: (
      identify: Types.IIdentify,
      eventOptions?: Types.EventOptions,
    ) => {
      const userProperties = identify.getUserProperties();

      calls.push(["identify", userProperties, eventOptions]);

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
      calls.push(["setGroup", groupType, groupName, eventOptions]);

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

      calls.push([
        "groupIdentify",
        groupType,
        groupName,
        groupProperties,
        eventOptions,
      ]);

      return dispatch({
        ...eventOptions,
        event_type: "$groupidentify",
        group_properties: groupProperties,
        groups: { [groupType]: groupName },
      });
    },
    flush: (): Types.AmplitudeReturn<void> => {
      calls.push(["flush"]);

      return { promise: Promise.resolve() };
    },
  };

  return { sdk, calls, uploaded, upload };
};
