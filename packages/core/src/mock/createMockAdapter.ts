import type { MockAdapterOptions } from "src/mock/types/MockAdapterOptions";
import type { MockIdentityCall } from "src/mock/types/MockIdentityCall";
import type { MockSession } from "src/mock/types/MockSession";
import type { MockTrack } from "src/mock/types/MockTrack";
import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { AnalyticsSession } from "src/types/AnalyticsSession";
import type { FlushResult } from "src/types/FlushResult";
import type { TrackResult } from "src/types/TrackResult";
import { createDeferred } from "src/utils/common/createDeferred";

const SUBMITTED: TrackResult = Object.freeze({
  status: "submitted",
  evidence: "sdk-call-returned",
});

const FLUSHED: FlushResult = Object.freeze({ status: "flushed" });

/**
 * An adapter for tests that records every call and answers as the test says.
 * It is deliberately not well behaved: it never guards itself after disposal
 * and never times out.
 *
 * @example
 * ```ts
 * const mock = createMockAdapter({ hold: true });
 * const trace = new Trace({ events, destinations: { test: mock.adapter } });
 *
 * trace.start();
 * const receipt = trace.track("App Opened");
 * mock.tracks[0]?.settle();
 * await receipt.settled;
 * ```
 */
export const createMockAdapter = (options: MockAdapterOptions = {}) => {
  const sessions: MockSession[] = [];
  const tracks: MockTrack[] = [];

  const open = (): AnalyticsSession<MockSession> => {
    if (typeof options.onOpen === "function") {
      options.onOpen();
    }

    const record: MockSession = {
      events: [],
      identity: [],
      collection: [],
      flushes: [],
      disposeCount: 0,
    };

    sessions.push(record);

    const handleIdentity = (call: MockIdentityCall) => {
      record.identity.push(call);

      if (typeof options.onIdentity !== "function") {
        return;
      }

      return options.onIdentity(call);
    };

    return {
      native: record,
      track: (event, context) => {
        const answer = createDeferred<TrackResult>();

        const track: MockTrack = {
          event,
          context,
          settle: (result = SUBMITTED) => answer.resolve(result),
          fail: answer.reject,
        };

        record.events.push(event);
        tracks.push(track);

        if (typeof options.onTrack === "function") {
          const answered = options.onTrack(track);

          if (answered !== undefined) {
            return answered;
          }
        }

        if (options.hold === true) {
          return answer.promise;
        }

        return SUBMITTED;
      },
      ...(options.identity === false
        ? {}
        : {
            identify: (update) =>
              handleIdentity({ kind: "identify", ...update }),
            traits: (update) => handleIdentity({ kind: "traits", ...update }),
            group: (update) => handleIdentity({ kind: "group", ...update }),
            reset: () => handleIdentity({ kind: "reset" }),
          }),
      ...(options.collection === false
        ? {}
        : {
            collection: (enabled) => {
              record.collection.push(enabled);
            },
          }),
      ...(options.flush === false
        ? {}
        : {
            flush: (context) => {
              const answer = createDeferred<FlushResult>();

              record.flushes.push({
                context,
                settle: (result = FLUSHED) => answer.resolve(result),
                fail: answer.reject,
              });

              if (options.flush === "hold") {
                return answer.promise;
              }

              return FLUSHED;
            },
          }),
      dispose: () => {
        record.disposeCount += 1;
      },
    };
  };

  const adapter: AnalyticsAdapter<MockSession> = {
    name: options.name ?? "mock",
    open,
  };

  return { adapter, sessions, tracks };
};
