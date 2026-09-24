import type { ConsentDecision } from "src/types/ConsentDecision";
import type { DestinationHandle } from "src/types/DestinationHandle";
import type { DestinationName } from "src/types/DestinationName";
import type { DestinationStatus } from "src/types/DestinationStatus";
import type { Destinations } from "src/types/Destinations";
import type { DropReason } from "src/types/DropReason";
import type { EventDefinition } from "src/types/EventDefinition";
import type { EventName } from "src/types/EventName";
import type { GroupInput } from "src/types/GroupInput";
import type { GroupsOf } from "src/types/GroupsOf";
import type { DiagnosticRecord } from "src/types/internal/DiagnosticRecord";
import type { IdentityTarget } from "src/types/internal/IdentityTarget";
import type { Layer } from "src/types/internal/Layer";
import type { PrivacyPolicy } from "src/types/internal/PrivacyPolicy";
import type { MappingLoss } from "src/types/MappingLoss";
import type { NativeOf } from "src/types/NativeOf";
import type { ObservableValue } from "src/types/ObservableValue";
import type { Receipt } from "src/types/Receipt";
import type { StandardSchema } from "src/types/StandardSchema";
import type { TraceConsent } from "src/types/TraceConsent";
import type { TraceDiagnostics } from "src/types/TraceDiagnostics";
import type { TraceEvents } from "src/types/TraceEvents";
import type { TraceFlushResult } from "src/types/TraceFlushResult";
import type { TraceOptions } from "src/types/TraceOptions";
import type { TraceSchema } from "src/types/TraceSchema";
import type { TraceScope } from "src/types/TraceScope";
import type { TraceSnapshot } from "src/types/TraceSnapshot";
import type { TraceStatus } from "src/types/TraceStatus";
import type { TrackArguments } from "src/types/TrackArguments";
import type { TrackedEvent } from "src/types/TrackedEvent";
import type { TraitsInput } from "src/types/TraitsInput";
import { assertUnreachable } from "src/utils/common/assertUnreachable";
import { getOwnValue } from "src/utils/common/getOwnValue";
import { isolate } from "src/utils/common/isolate";
import { ValueStore } from "src/utils/common/ValueStore";
import { DIAGNOSTIC_TYPES } from "src/utils/constants/diagnostics";
import {
  DISPOSED_DESTINATION_STATUS,
  DISPOSED_TRACE_STATUS,
  IDLE_DESTINATION_STATUS,
  IDLE_TRACE_STATUS,
  READY_DESTINATION_STATUS,
  STARTED_TRACE_STATUS,
} from "src/utils/constants/status";
import { ConsentState } from "src/utils/internal/consent/ConsentState";
import { DestinationLane } from "src/utils/internal/destinations/DestinationLane";
import { Diagnostics } from "src/utils/internal/diagnostics/Diagnostics";
import { createDroppedReceipt } from "src/utils/internal/dispatch/createDroppedReceipt";
import { createReceipt } from "src/utils/internal/dispatch/createReceipt";
import { createEventId } from "src/utils/internal/event/createEventId";
import { getUsableId } from "src/utils/internal/identity/getUsableId";
import { IdentityState } from "src/utils/internal/identity/IdentityState";
import { readId } from "src/utils/internal/identity/readId";
import { boundLayer } from "src/utils/internal/intake/boundLayer";
import { composeContext } from "src/utils/internal/intake/composeContext";
import { getCappedLosses } from "src/utils/internal/intake/getCappedLosses";
import { getLayerValues } from "src/utils/internal/intake/getLayerValues";
import { keepLosses } from "src/utils/internal/intake/keepLosses";
import { parseEvent } from "src/utils/internal/intake/parseEvent";
import { prepareEvent } from "src/utils/internal/intake/prepareEvent";
import { prepareLayer } from "src/utils/internal/intake/prepareLayer";
import { readCall } from "src/utils/internal/intake/readCall";
import { getFlushTimeout } from "src/utils/internal/options/getFlushTimeout";
import { readOptions } from "src/utils/internal/options/readOptions";
import { resolveRoute } from "src/utils/internal/routing/resolveRoute";
import { TraceError } from "src/utils/TraceError";

type PreparedLayer = ReturnType<typeof prepareLayer>;

type Validators = Map<string, StandardSchema<unknown, unknown>>;

type Subscribe = (listener: () => void) => () => void;

const UNREADABLE_CALL = Object.freeze({
  path: "options",
  message: "The track options could not be read.",
});

const INVALID_NAME = Object.freeze({
  path: "",
  message: "The event name is not a string.",
});

const INVALID_TIMESTAMP: MappingLoss = Object.freeze({
  path: "timestamp",
  reason: "invalid",
});

const SNAPSHOT_STATUSES = Object.freeze({
  idle: IDLE_DESTINATION_STATUS,
  ready: READY_DESTINATION_STATUS,
  failed: Object.freeze({ state: "failed" }),
  disposed: DISPOSED_DESTINATION_STATUS,
} satisfies {
  [TState in DestinationStatus["state"]]: { state: TState };
});

const MAX_TIMESTAMP = 8.64e15;

// The overload preserves the name-to-native relation erased by a lookup by name.
function resolveDestination<
  TDestinations extends Destinations,
  TName extends DestinationName<TDestinations>,
>(
  lanes: Map<
    DestinationName<TDestinations>,
    { handle: DestinationHandle<unknown> }
  >,
  name: TName,
): DestinationHandle<NativeOf<TDestinations>[TName]>;
function resolveDestination(
  lanes: Map<string, { handle: DestinationHandle<unknown> }>,
  name: string,
): DestinationHandle<unknown> {
  const destination = lanes.get(name);

  if (destination === undefined) {
    const configured = Array.from(lanes.keys(), (key) => JSON.stringify(key));

    const asked =
      typeof name === "string"
        ? `Trace has no destination named ${JSON.stringify(name)}.`
        : "Trace has no destination for a name that is not a string.";

    const known =
      configured.length === 0
        ? "This Trace was constructed with no destinations."
        : `The configured destinations are ${configured.join(", ")}.`;

    throw new TraceError({
      code: "INVALID_CONFIGURATION",
      message: `${asked} ${known}`,
    });
  }

  return destination.handle;
}

/**
 * Typed, provider-independent product analytics over named destinations.
 * Constructing one opens nothing, and nothing here throws at runtime except
 * `destination()` for a name that was never configured.
 *
 * @example
 * ```ts
 * const trace = new Trace({
 *   events: { "App Opened": event() },
 *   destinations: { product: amplitude({ sdk: Amplitude, Identify: Amplitude.Identify }) },
 * });
 *
 * trace.start();
 * trace.track("App Opened");
 * ```
 */
export class Trace<
  TEvents extends Record<string, EventDefinition<never, unknown>>,
  TDestinations extends Destinations,
  TSchema extends TraceSchema = TraceSchema,
  TPurpose extends string = string,
> {
  #events: Map<string, EventDefinition<unknown, unknown>>;
  #policy: PrivacyPolicy;
  #schema: {
    traits: Validators | null;
    groups: Map<string, Validators> | null;
  };
  #defaultTo: unknown;
  #now: () => number;
  #names: DestinationName<TDestinations>[];
  #lanes = new Map<
    DestinationName<TDestinations>,
    {
      lane: DestinationLane;
      adapter: { name: string };
      handle: DestinationHandle<unknown>;
    }
  >();
  #identity = new IdentityState();
  #consent: ConsentState;
  #decisions: ValueStore<Record<TPurpose, ConsentDecision>>;
  #status = new ValueStore<TraceStatus>(IDLE_TRACE_STATUS);
  #diagnostics: Diagnostics;
  #listeners = new Set<{ listener: unknown }>();
  #releases = new Set<() => void>();
  #context: Layer;
  #unscoped: PreparedLayer = { layer: new Map(), refused: [] };
  #traitLosses = new Map<string, MappingLoss[]>();
  #groupLosses = new Map<
    string,
    { id: string; losses: Map<string, MappingLoss[]> }
  >();
  #depth = 0;
  #pendingReceipts = 0;

  constructor(
    options: TraceOptions<TEvents, TDestinations, TSchema, TPurpose>,
  ) {
    const read = readOptions(options);

    this.#events = read.events;
    this.#policy = read.policy;
    this.#schema = read.schema;
    this.#defaultTo = read.to;
    this.#now = read.now;
    this.#context = read.context;
    this.#consent = new ConsentState({ required: read.consent });
    this.#decisions = new ValueStore<Record<TPurpose, ConsentDecision>>(
      this.#consent.decisions(),
    );
    this.#diagnostics = new Diagnostics({
      read: this.#readSnapshot,
      now: read.now,
    });

    const { api } = this.#diagnostics;

    this.diagnostics = Object.freeze({
      get: api.get,
      subscribe: api.subscribe,
      events: Object.freeze({ subscribe: api.events.subscribe }),
    });
    this.consent = Object.freeze({
      get: this.#decisions.get,
      subscribe: this.#observe(this.#decisions.subscribe),
      set: this.#setConsent,
    });

    const depth = {
      enter: () => {
        this.#depth += 1;
      },
      exit: () => {
        this.#depth -= 1;
      },
    };

    for (const { name, adapter, gated } of read.destinations) {
      const lane = new DestinationLane({
        name,
        adapter,
        gated,
        buffer: read.buffer,
        timeout: read.timeout,
        now: read.now,
        isOpen: () => this.#consent.isOpen(name),
        currentIdentity: this.#identity.target,
        record: this.#diagnostics.record,
        changed: this.#diagnostics.changed,
        depth,
      });

      this.#lanes.set(name, {
        adapter: Object.freeze({ name: adapter.name }),
        lane,
        handle: Object.freeze({
          status: Object.freeze({
            get: lane.status.get,
            subscribe: this.#observe(lane.status.subscribe),
          }),
          get native() {
            return lane.native();
          },
        }),
      });
    }

    this.#names = [...this.#lanes.keys()];
  }

  /**
   * Whether the Trace is idle, started or disposed, as interned objects that
   * compare by identity. Observing it starts nothing.
   *
   * @example
   * ```ts
   * trace.status.subscribe(() => console.log(trace.status.get().state));
   * ```
   */
  status: ObservableValue<TraceStatus> = Object.freeze({
    get: this.#status.get,
    subscribe: this.#observe(this.#status.subscribe),
  });

  /**
   * A passive view for devtools: a snapshot of the runtime and a timeline of
   * events that carry no payload. Observing it opens nothing and creates no
   * event, and a `track` made from a snapshot or `events` listener is dropped
   * as `reentrant` and recorded only on its receipt.
   *
   * @example
   * ```ts
   * trace.diagnostics.events.subscribe((event) => console.log(event.type));
   * ```
   */
  diagnostics: TraceDiagnostics;

  /**
   * The stream of accepted events, each delivered after its acceptance and
   * before any destination receives it. It never replays, and a `track` made
   * from a listener is dropped as `reentrant`.
   *
   * @example
   * ```ts
   * const stop = trace.events.subscribe((event) => console.log(event.name));
   * ```
   */
  events: TraceEvents<TEvents> = Object.freeze({
    subscribe: (listener) => {
      if (this.#isDisposed()) {
        return () => {};
      }

      const subscription = { listener };

      this.#listeners.add(subscription);

      return () => {
        this.#listeners.delete(subscription);
      };
    },
  });

  /**
   * The decision for each purpose the `consent` option names. Every purpose
   * starts `unknown`, and a destination is open only while all its purposes
   * are `granted`.
   *
   * @example
   * ```ts
   * trace.consent.set({ analytics: "granted", advertising: "denied" });
   * ```
   */
  consent: TraceConsent<TPurpose>;

  /**
   * Opens every destination. Later calls retry only destinations whose open
   * failed, and nothing happens after `dispose()`.
   *
   * @example
   * ```ts
   * trace.start();
   * ```
   */
  start = () => {
    if (this.#isDisposed()) {
      return;
    }

    if (this.#status.get() === IDLE_TRACE_STATUS) {
      this.#status.set(STARTED_TRACE_STATUS);
      this.#record("runtime", DIAGNOSTIC_TYPES.TRACE_STARTED, null);
    }

    for (const { lane } of this.#lanes.values()) {
      lane.start();
    }

    this.#diagnostics.changed();
  };

  /**
   * Accepts one declared event and hands it to each destination it is routed
   * to. It is synchronous and never throws, and the receipt says what each
   * destination did with the event.
   *
   * @example
   * ```ts
   * const receipt = trace.track("Search Performed", { query: "shoes" }, { to: ["product"] });
   * ```
   */
  track = <TName extends EventName<TEvents>>(
    name: TName,
    ...args: TrackArguments<TEvents[TName], DestinationName<TDestinations>>
  ): Receipt<DestinationName<TDestinations>> =>
    this.#track(name, args, this.#unscoped);

  /**
   * Sets who events belong to, or signs out with `null`. A different user,
   * or signing out, starts a new identity generation and drops what the
   * previous user left pending.
   *
   * @example
   * ```ts
   * trace.user({ id: "user_42", traits: { plan: "pro" } });
   * trace.user(null);
   * ```
   */
  user = (user: { id: string; traits?: TraitsInput<TSchema> } | null) => {
    if (this.#isDisposed()) {
      return;
    }

    if (user === null) {
      this.#applyUser(null);

      return;
    }

    const { generation } = this.#identity.target();
    const id = getUsableId(readId(user));

    if (id === null) {
      this.#record("identity", DIAGNOSTIC_TYPES.USER_REFUSED, null);

      return;
    }

    const traits = this.#prepare(
      () => user.traits,
      "traits",
      this.#schema.traits,
    );

    if (!this.#isCurrent(generation)) {
      return;
    }

    this.#applyUser({ id, traits });
  };

  /**
   * Merges traits into the current user or visitor; a `null` value removes
   * the trait.
   *
   * @example
   * ```ts
   * trace.traits({ plan: "pro", role: null });
   * ```
   */
  traits = (traits: TraitsInput<TSchema>) => {
    if (this.#isDisposed()) {
      return;
    }

    const { generation } = this.#identity.target();
    const prepared = this.#prepare(() => traits, "traits", this.#schema.traits);

    if (!this.#isCurrent(generation)) {
      return;
    }

    const before = this.#identity.target();

    if (prepared !== null) {
      this.#applyTraits(prepared.layer);
    }

    this.#syncIdentity(before);
    this.#refuse(prepared?.refused ?? ["traits"]);
  };

  /**
   * Sets the membership for one group type, or leaves the group with `null`.
   * A different id starts the group's traits fresh; the same id merges them.
   *
   * @example
   * ```ts
   * trace.group("workspace", { id: "w_1", traits: { plan: "team" } });
   * ```
   */
  group = <TType extends keyof GroupsOf<TSchema> & string>(
    type: TType,
    group: GroupInput<TSchema, TType> | null,
  ) => {
    if (this.#isDisposed()) {
      return;
    }

    if (typeof type !== "string") {
      this.#refuseGroup("groups");

      return;
    }

    const path = `groups.${type}`;

    const validators =
      this.#schema.groups === null ? null : this.#schema.groups.get(type);

    if (getUsableId(type) === null || validators === undefined) {
      this.#refuseGroup(path);

      return;
    }

    if (group === null) {
      this.#applyGroup(type, null);

      return;
    }

    const { generation } = this.#identity.target();
    const id = getUsableId(readId(group));

    if (id === null) {
      this.#refuseGroup(path);

      return;
    }

    const traits = this.#prepare(() => group.traits, path, validators);

    if (!this.#isCurrent(generation)) {
      return;
    }

    this.#applyGroup(type, { id, traits });
  };

  /**
   * Merges into the context every event carries; a `null` value removes the
   * key. It survives user changes, and a context that cannot be sanitized
   * changes nothing.
   *
   * @example
   * ```ts
   * trace.context({ screen: "checkout" });
   * ```
   */
  context = (context: Record<string, unknown>) => {
    if (this.#isDisposed()) {
      return;
    }

    const prepared = this.#prepare(() => context, "context", null);

    if (prepared === null || prepared.refused.length > 0) {
      this.#record("runtime", DIAGNOSTIC_TYPES.CONTEXT_REFUSED, null);

      return;
    }

    this.#context = composeContext([this.#context, prepared.layer]);
  };

  /**
   * A `track` bound to one more context layer, which is taken when the scope
   * is created. It holds no identity and does not nest.
   *
   * @example
   * ```ts
   * const checkout = trace.scope({ context: { flow: "checkout" } });
   * checkout.track("App Opened");
   * ```
   */
  scope = (options: {
    context: Record<string, unknown>;
  }): TraceScope<TEvents, DestinationName<TDestinations>> => {
    const prepared = this.#prepare(() => options.context, "context", null);

    return Object.freeze({
      track: (name, ...args) => this.#track(name, args, prepared),
    });
  };

  /**
   * The escape hatch to one destination: its status and the SDK it was given,
   * `null` until it is ready. Calls made on `native` bypass Trace's routing,
   * consent, receipts and redaction.
   *
   * @example
   * ```ts
   * const sdk = trace.destination("product").native;
   * ```
   */
  destination = <TName extends DestinationName<TDestinations>>(
    name: TName,
  ): DestinationHandle<NativeOf<TDestinations>[TName]> =>
    resolveDestination<TDestinations, TName>(this.#lanes, name);

  /**
   * Waits for the work accepted before the call, then for each provider's own
   * flush, bounded by `timeout`. It never rejects, and work accepted after the
   * call does not extend it.
   *
   * @example
   * ```ts
   * const { drained } = await trace.flush({ timeout: 1_000 });
   * ```
   */
  flush = async (options?: {
    timeout?: number;
  }): Promise<TraceFlushResult<DestinationName<TDestinations>>> => {
    const timeout = getFlushTimeout(options);

    this.#record("runtime", DIAGNOSTIC_TYPES.FLUSH_STARTED, null, {
      timeout,
    });

    const answers = await Promise.all(
      Array.from(this.#lanes, async ([name, { lane }]) => ({
        name,
        result: await lane.flush({ timeout }),
      })),
    );

    // A null prototype, so a destination named __proto__ stays an own key.
    const destinations: TraceFlushResult<
      DestinationName<TDestinations>
    >["destinations"] = Object.create(null);

    for (const { name, result } of answers) {
      destinations[name] = result;
    }

    const drained = answers.every(
      ({ result }) =>
        result.status !== "timeout" && result.status !== "not-ready",
    );

    this.#record("runtime", DIAGNOSTIC_TYPES.FLUSH_COMPLETED, null, {
      drained,
    });

    return Object.freeze({
      drained,
      destinations: Object.freeze(destinations),
    });
  };

  /**
   * Releases every destination synchronously: what is buffered drops as
   * `disposed`, what is in flight settles `indeterminate`, and each session is
   * disposed once. Later calls do nothing.
   *
   * @example
   * ```ts
   * trace.dispose();
   * ```
   */
  dispose = () => {
    if (this.#isDisposed()) {
      return;
    }

    this.#status.set(DISPOSED_TRACE_STATUS);

    for (const { lane } of this.#lanes.values()) {
      lane.dispose();
    }

    this.#listeners.clear();
    this.#diagnostics.dispose();

    for (const release of this.#releases) {
      release();
    }

    this.#releases.clear();
  };

  #setConsent = (decisions: Partial<Record<TPurpose, ConsentDecision>>) => {
    if (this.#isDisposed()) {
      return;
    }

    const { changed, refused } = this.#consent.set(decisions);

    if (changed) {
      for (const { lane } of this.#lanes.values()) {
        lane.consentChanged();
      }
    }

    if (changed || refused.length > 0) {
      this.#record("consent", DIAGNOSTIC_TYPES.CONSENT_CHANGED, null, {
        decisions: this.#consent.decisions(),
        refused,
      });
    }

    if (changed) {
      this.#diagnostics.changed();
      this.#decisions.set(this.#consent.decisions());
    }
  };

  #readSnapshot = (): TraceSnapshot => {
    const { generation, user } = this.#identity.target();

    const destinations = Array.from(this.#lanes, ([name, { lane, adapter }]) =>
      Object.freeze({
        name,
        adapter,
        status: SNAPSHOT_STATUSES[lane.status.get().state],
        buffered: lane.buffered(),
        inFlight: lane.inFlight(),
      }),
    );

    Object.freeze(destinations);

    return Object.freeze({
      status: this.#status.get(),
      identity: Object.freeze({ generation, user }),
      consent: this.#consent.decisions(),
      pendingReceipts: this.#pendingReceipts,
      destinations,
    });
  };

  #isDisposed() {
    return this.#status.get() === DISPOSED_TRACE_STATUS;
  }

  // Validators and redact can change the user while data is prepared.
  #isCurrent(generation: number) {
    return this.#identity.target().generation === generation;
  }

  #observe(subscribe: Subscribe): Subscribe {
    return (listener) => {
      if (this.#isDisposed()) {
        return () => {};
      }

      const release = subscribe(listener);

      this.#releases.add(release);

      return () => {
        this.#releases.delete(release);
        release();
      };
    };
  }

  #track(
    name: unknown,
    args: unknown[],
    scope: PreparedLayer | null,
  ): Receipt<DestinationName<TDestinations>> {
    const id = createEventId();

    if (this.#isDisposed()) {
      return this.#drop(id, name, "disposed");
    }

    if (this.#depth > 0 || this.#diagnostics.isDelivering()) {
      return this.#drop(id, name, "reentrant");
    }

    if (typeof name !== "string") {
      return this.#drop(id, name, "invalid", [INVALID_NAME]);
    }

    const call = readCall(args[1]);

    if (call === null) {
      return this.#drop(id, name, "invalid", [UNREADABLE_CALL]);
    }

    const to =
      call.to === undefined || call.to === null ? this.#defaultTo : call.to;

    const candidates = resolveRoute({
      configured: this.#names,
      to,
      event: null,
    });

    if (candidates === null || candidates.length === 0) {
      return this.#drop(id, name, "not-routed");
    }

    if (!candidates.some(this.#consent.isOpen)) {
      return this.#drop(id, name, "consent");
    }

    const parsed = parseEvent({
      name,
      definition: this.#events.get(name),
      input: args[0],
    });

    if (!parsed.ok) {
      return this.#drop(id, name, "invalid", parsed.issues);
    }

    if (scope === null) {
      return this.#drop(id, name, "sanitizer-failed");
    }

    const prepared = prepareEvent({
      properties: parsed.properties,
      layers: [{ layer: this.#context, refused: [] }, scope],
      context: call.context,
      policy: this.#policy,
    });

    if (prepared.kind === "FAILED") {
      return this.#drop(id, name, "sanitizer-failed");
    }

    if (prepared.kind !== "PREPARED") {
      return assertUnreachable(prepared);
    }

    const time = this.#getTime(call.timestamp);
    const identity = this.#identity.target();

    const event: TrackedEvent = Object.freeze({
      id,
      name,
      properties: prepared.properties,
      context: prepared.context,
      identity: this.#identity.snapshot(),
      timestamp: time.timestamp,
    });

    const losses = [
      ...prepared.losses,
      ...time.losses,
      ...this.#getIdentityLosses(),
    ];

    Object.freeze(losses);

    const route =
      typeof to === "function"
        ? resolveRoute({ configured: this.#names, to, event })
        : candidates;

    if (route === null || route.length === 0) {
      return this.#drop(id, name, "not-routed");
    }

    const open = route.filter(this.#consent.isOpen);

    Object.freeze(open);

    if (open.length === 0) {
      return this.#drop(id, name, "consent");
    }

    this.#record("event", DIAGNOSTIC_TYPES.EVENT_ACCEPTED, id, {
      name,
      destinations: open,
      losses,
    });
    this.#deliver(event);

    return this.#dispatch(event, identity, losses, open);
  }

  #getTime(given: unknown) {
    if (
      typeof given === "number" &&
      Number.isFinite(given) &&
      Math.abs(given) <= MAX_TIMESTAMP
    ) {
      return { timestamp: given, losses: [] };
    }

    return {
      timestamp: this.#now(),
      losses: given === undefined || given === null ? [] : [INVALID_TIMESTAMP],
    };
  }

  #getIdentityLosses() {
    const { breadth } = this.#policy.limits;

    return [
      ...getCappedLosses(
        [...this.#traitLosses.values()].flat(),
        "traits",
        breadth,
      ),
      ...Array.from(this.#groupLosses).flatMap(([type, { losses }]) =>
        getCappedLosses([...losses.values()].flat(), `groups.${type}`, breadth),
      ),
    ];
  }

  #deliver(event: TrackedEvent) {
    for (const subscription of [...this.#listeners]) {
      const { listener } = subscription;

      if (
        !this.#listeners.has(subscription) ||
        typeof listener !== "function"
      ) {
        continue;
      }

      this.#depth += 1;

      try {
        isolate(
          () => listener(event),
          () =>
            this.#record("event", DIAGNOSTIC_TYPES.LISTENER_FAILED, event.id),
        );
      } finally {
        this.#depth -= 1;
      }
    }
  }

  #dispatch(
    event: TrackedEvent,
    identity: IdentityTarget,
    losses: MappingLoss[],
    names: DestinationName<TDestinations>[],
  ) {
    this.#pendingReceipts += 1;
    this.#diagnostics.changed();

    const { receipt, land } = createReceipt({
      id: event.id,
      destinations: names,
      onSettled: () => {
        this.#pendingReceipts -= 1;
        this.#diagnostics.changed();
      },
    });

    for (const [name, { lane }] of this.#lanes) {
      if (!names.includes(name)) {
        continue;
      }

      lane.enqueue({
        event,
        identity,
        losses,
        land: (outcome) => land(name, outcome),
      });
    }

    return receipt;
  }

  #drop(
    id: string,
    name: unknown,
    reason: DropReason,
    issues: { path: string; message: string }[] = [],
  ) {
    // A listener that tracks on each diagnostic would otherwise hear its own drop and track again.
    if (!this.#diagnostics.isDelivering()) {
      this.#record("event", DIAGNOSTIC_TYPES.EVENT_DROPPED, id, {
        name: typeof name === "string" ? name : null,
        reason,
      });
    }

    return createDroppedReceipt<DestinationName<TDestinations>>({
      id,
      reason,
      issues,
    });
  }

  #applyUser(user: { id: string; traits: PreparedLayer | null } | null) {
    const before = this.#identity.target();

    const change = this.#identity.setUser(user);

    const { generation, user: current } = this.#identity.target();
    const ended = change.kind === "CHANGED" && change.ended;

    if (ended) {
      this.#traitLosses.clear();
      this.#groupLosses.clear();
    }

    if (user !== null && user.traits !== null) {
      this.#applyTraits(user.traits.layer);
    }

    if (ended) {
      // Every floor rises before any drop lands, so no listener can start a lane that still holds them.
      const drops = Array.from(this.#lanes.values(), ({ lane }) =>
        lane.dropBefore(generation),
      );

      for (const land of drops) {
        land();
      }
    }

    this.#syncIdentity(before);

    if (change.kind === "CHANGED") {
      this.#record("identity", DIAGNOSTIC_TYPES.USER_CHANGED, null, {
        generation,
        user: current,
      });
    }

    if (user !== null) {
      this.#refuse(user.traits?.refused ?? ["traits"]);
    }
  }

  #applyTraits(layer: Layer) {
    const bounded = boundLayer({
      held: this.#identity.snapshot().traits,
      layer,
      root: "traits",
      limits: this.#policy.limits,
    });

    this.#identity.setTraits(getLayerValues(bounded));
    keepLosses(this.#traitLosses, bounded);
  }

  #applyGroup(
    type: string,
    group: { id: string; traits: PreparedLayer | null } | null,
  ) {
    const path = `groups.${type}`;
    const before = this.#identity.target();

    if (group === null) {
      this.#identity.setGroup(type, null);
      this.#groupLosses.delete(type);
      this.#syncIdentity(before);

      return;
    }

    const { groups } = this.#identity.snapshot();
    const held = getOwnValue(groups, type);

    if (
      held === undefined &&
      Object.keys(groups).length >= this.#policy.limits.breadth
    ) {
      this.#refuseGroup(path);

      return;
    }

    const bounded = boundLayer({
      held: held?.id === group.id ? held.traits : {},
      layer: group.traits?.layer ?? new Map(),
      root: path,
      limits: this.#policy.limits,
    });

    this.#identity.setGroup(type, {
      id: group.id,
      traits: getLayerValues(bounded),
    });

    const known = this.#groupLosses.get(type);

    const losses =
      known?.id === group.id ? known.losses : new Map<string, MappingLoss[]>();

    keepLosses(losses, bounded);
    this.#groupLosses.set(type, { id: group.id, losses });
    this.#syncIdentity(before);
    this.#refuse(group.traits?.refused ?? [path]);
  }

  #syncIdentity(before: IdentityTarget) {
    if (this.#identity.target() === before) {
      return;
    }

    for (const { lane } of this.#lanes.values()) {
      lane.identityChanged();
    }

    this.#diagnostics.changed();
  }

  #prepare(read: () => unknown, root: string, schema: Validators | null) {
    try {
      return prepareLayer(read(), { root, policy: this.#policy, schema });
    } catch {
      return null;
    }
  }

  #refuse(paths: string[]) {
    for (const path of paths) {
      this.#record("identity", DIAGNOSTIC_TYPES.TRAITS_REFUSED, null, {
        path,
      });
    }
  }

  #refuseGroup(path: string) {
    this.#record("identity", DIAGNOSTIC_TYPES.GROUP_REFUSED, null, { path });
  }

  #record(
    source: DiagnosticRecord["source"],
    type: DiagnosticRecord["type"],
    event: string | null,
    context?: DiagnosticRecord["context"],
  ) {
    this.#diagnostics.record({
      source,
      type,
      destination: null,
      event,
      ...(context === undefined ? {} : { context }),
    });
  }
}
