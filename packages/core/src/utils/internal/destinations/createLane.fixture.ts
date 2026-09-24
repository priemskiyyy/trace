import { createMockAdapter } from "src/mock/createMockAdapter";
import type { MockAdapterOptions } from "src/mock/types/MockAdapterOptions";
import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { AnalyticsSession } from "src/types/AnalyticsSession";
import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { DiagnosticRecord } from "src/types/internal/DiagnosticRecord";
import type { IdentityTarget } from "src/types/internal/IdentityTarget";
import type { LaneEntry } from "src/types/internal/LaneEntry";
import type { MappingLoss } from "src/types/MappingLoss";
import { createDeferred } from "src/utils/common/createDeferred";
import { DestinationLane } from "src/utils/internal/destinations/DestinationLane";

export const createLane = ({
  mock: mockOptions = {},
  adapter,
  gated = false,
  capacity = 10,
  maxAge = 60_000,
  timeout = 5_000,
  consent = true,
  identity = { generation: 0, user: null, traits: {}, groups: {} },
  now = () => Date.now(),
  onRecord = () => {},
  onChanged = () => {},
}: {
  mock?: MockAdapterOptions;
  adapter?: AnalyticsAdapter;
  gated?: boolean;
  capacity?: number;
  maxAge?: number;
  timeout?: number;
  consent?: boolean;
  identity?: IdentityTarget;
  now?: () => number;
  onRecord?: (record: DiagnosticRecord) => void;
  onChanged?: () => void;
} = {}) => {
  const mock = createMockAdapter(mockOptions);
  const base = adapter ?? mock.adapter;
  const log: string[] = [];
  const depths: number[] = [];
  const records: DiagnosticRecord[] = [];
  const outcomes = new Map<string, DestinationOutcome[]>();
  const landings = new Map<string, Promise<DestinationOutcome>>();
  const entries = new Map<string, LaneEntry>();
  const changes: { buffered: number; inFlight: number; state: string }[] = [];

  let open = consent;
  let current = identity;
  let level = 0;

  const called = (name: string) => {
    log.push(name);
    depths.push(level);
  };

  const logged: AnalyticsAdapter = {
    name: base.name,
    open: () => {
      called("open");

      const session = base.open();

      if (
        typeof session !== "object" ||
        session === null ||
        typeof session.track !== "function"
      ) {
        return session;
      }

      const track = session.track.bind(session);

      const wrapped: AnalyticsSession = {
        get native() {
          return session.native;
        },
        track: (event, context) => {
          called(`track ${event.id}`);

          return track(event, context);
        },
      };

      if (typeof session.identify === "function") {
        const identify = session.identify.bind(session);

        wrapped.identify = (update) => {
          called(`identify ${update.user.id}`);

          return identify(update);
        };
      }

      if (typeof session.traits === "function") {
        const traits = session.traits.bind(session);

        wrapped.traits = (update) => {
          called("traits");

          return traits(update);
        };
      }

      if (typeof session.group === "function") {
        const group = session.group.bind(session);

        wrapped.group = (update) => {
          called(`group ${update.group.type}`);

          return group(update);
        };
      }

      if (typeof session.reset === "function") {
        const reset = session.reset.bind(session);

        wrapped.reset = () => {
          called("reset");

          return reset();
        };
      }

      if (typeof session.collection === "function") {
        const collection = session.collection.bind(session);

        wrapped.collection = (enabled) => {
          called(`collection ${enabled}`);

          return collection(enabled);
        };
      }

      if (typeof session.flush === "function") {
        const flush = session.flush.bind(session);

        wrapped.flush = (context) => {
          called("flush");

          return flush(context);
        };
      }

      if (typeof session.dispose === "function") {
        const dispose = session.dispose.bind(session);

        wrapped.dispose = () => {
          called("dispose");

          return dispose();
        };
      }

      return wrapped;
    },
  };

  const lane = new DestinationLane({
    name: "product",
    adapter: logged,
    gated,
    buffer: { capacity, maxAge },
    timeout,
    now,
    isOpen: () => open,
    currentIdentity: () => current,
    record: (record) => {
      records.push(record);
      onRecord(record);
    },
    changed: () => {
      changes.push({
        buffered: lane.buffered(),
        inFlight: lane.inFlight(),
        state: lane.status.get().state,
      });
      onChanged();
    },
    depth: {
      enter: () => {
        level += 1;
      },
      exit: () => {
        level -= 1;
      },
    },
  });

  const enqueue = (
    id: string,
    target: IdentityTarget = current,
    losses: MappingLoss[] = [],
  ) => {
    const landed: DestinationOutcome[] = [];
    const landing = createDeferred<DestinationOutcome>();

    const entry: LaneEntry = {
      event: {
        id,
        name: "App Opened",
        properties: {},
        context: {},
        identity: {
          generation: target.generation,
          user: target.user,
          traits: {},
          groups: {},
        },
        timestamp: 1,
      },
      identity: target,
      losses,
      land: (outcome) => {
        landed.push(outcome);
        landing.resolve(outcome);
      },
    };

    outcomes.set(id, landed);
    landings.set(id, landing.promise);
    entries.set(id, entry);
    lane.enqueue(entry);
  };

  return {
    lane,
    mock,
    log,
    depths,
    records,
    outcomes,
    entries,
    changes,
    enqueue,
    landed: (id: string) =>
      landings.get(id) ??
      Promise.reject(new Error(`Nothing enqueued as ${id}.`)),
    level: () => level,
    setIdentity: (next: IdentityTarget) => {
      current = next;
    },
    setConsent: (next: boolean) => {
      open = next;
      lane.consentChanged();
    },
    setConsentSilently: (next: boolean) => {
      open = next;
    },
  };
};
