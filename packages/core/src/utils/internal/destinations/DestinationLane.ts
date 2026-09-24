import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { AnalyticsSession } from "src/types/AnalyticsSession";
import type { DestinationFlushResult } from "src/types/DestinationFlushResult";
import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { DestinationStatus } from "src/types/DestinationStatus";
import type { Answer } from "src/types/internal/Answer";
import type { DiagnosticRecord } from "src/types/internal/DiagnosticRecord";
import type { IdentityTarget } from "src/types/internal/IdentityTarget";
import type { LaneEntry } from "src/types/internal/LaneEntry";
import type { SessionIdentityMethods } from "src/types/internal/SessionIdentityMethods";
import type { StepAnswer } from "src/types/internal/StepAnswer";
import type { ObservableValue } from "src/types/ObservableValue";
import { assertUnreachable } from "src/utils/common/assertUnreachable";
import { createDeferred } from "src/utils/common/createDeferred";
import { ValueStore } from "src/utils/common/ValueStore";
import { DIAGNOSTIC_TYPES } from "src/utils/constants/diagnostics";
import {
  DISPOSED_DESTINATION_STATUS,
  IDLE_DESTINATION_STATUS,
  READY_DESTINATION_STATUS,
} from "src/utils/constants/status";
import { callIdentityStep } from "src/utils/internal/destinations/callIdentityStep";
import { copyTrackResult } from "src/utils/internal/destinations/copyTrackResult";
import { getAnswer } from "src/utils/internal/destinations/getAnswer";
import { getFlushResult } from "src/utils/internal/destinations/getFlushResult";
import { getOpenedSession } from "src/utils/internal/destinations/getOpenedSession";
import { getOutcomeContext } from "src/utils/internal/destinations/getOutcomeContext";
import { getStepFailure } from "src/utils/internal/destinations/getStepFailure";
import { LaneBuffer } from "src/utils/internal/destinations/LaneBuffer";
import { unrefTimer } from "src/utils/internal/destinations/unrefTimer";
import { planIdentity } from "src/utils/internal/identity/planIdentity";

type Options = {
  name: string;
  adapter: AnalyticsAdapter;
  gated: boolean;
  buffer: { capacity: number; maxAge: number };
  timeout: number;
  now: () => number;
  isOpen: () => boolean;
  currentIdentity: () => IdentityTarget;
  record: (record: DiagnosticRecord) => void;
  changed: () => void;
  depth: { enter: () => void; exit: () => void };
};

type OpenState = {
  state: "OPEN";
  status: DestinationStatus;
  session: AnalyticsSession;
  native: unknown;
  methods: SessionIdentityMethods;
};

type State =
  | { state: "IDLE"; status: DestinationStatus }
  | OpenState
  | { state: "FAILED"; status: DestinationStatus }
  | { state: "DISPOSED"; status: DestinationStatus };

type Pending = {
  entry: LaneEntry;
  handedOff: ReturnType<typeof createDeferred<void>>;
  done: ReturnType<typeof createDeferred<void>>;
};

type Flight = {
  pending: Pending;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
};

const IDLE: State = Object.freeze({
  state: "IDLE",
  status: IDLE_DESTINATION_STATUS,
});

const DISPOSED: Extract<State, { state: "DISPOSED" }> = Object.freeze({
  state: "DISPOSED",
  status: DISPOSED_DESTINATION_STATUS,
});

const STEP_TIMEOUT: StepAnswer = Object.freeze({ kind: "TIMEOUT" });

const NOT_READY: DestinationFlushResult = Object.freeze({
  status: "not-ready",
});

const UNSUPPORTED: DestinationFlushResult = Object.freeze({
  status: "unsupported",
});

const TIMED_OUT: DestinationFlushResult = Object.freeze({ status: "timeout" });

const STATE_TYPES = Object.freeze({
  OPEN: DIAGNOSTIC_TYPES.DESTINATION_READY,
  FAILED: DIAGNOSTIC_TYPES.DESTINATION_FAILED,
  DISPOSED: DIAGNOSTIC_TYPES.DESTINATION_DISPOSED,
} satisfies Record<Exclude<State["state"], "IDLE">, DiagnosticRecord["type"]>);

const OUTCOME_TYPES = Object.freeze({
  submitted: DIAGNOSTIC_TYPES.EVENT_SUBMITTED,
  dropped: DIAGNOSTIC_TYPES.EVENT_DROPPED,
  skipped: DIAGNOSTIC_TYPES.EVENT_SKIPPED,
  failed: DIAGNOSTIC_TYPES.EVENT_FAILED,
  indeterminate: DIAGNOSTIC_TYPES.EVENT_INDETERMINATE,
} satisfies Record<DestinationOutcome["status"], DiagnosticRecord["type"]>);

export class DestinationLane {
  #options: Options;
  #state = new ValueStore<State>(IDLE);
  #buffer: LaneBuffer<Pending>;
  #seed: number;
  #current: Pending | null = null;
  #dropping = new Set<Pending>();
  #flights = new Set<Flight>();
  #waits = new Set<() => void>();
  #opening = false;
  #retryRequested = false;
  #pumping = false;
  #passRequested = false;
  #switching: Promise<void> | null = null;
  #consented = true;
  #fresh = true;
  #applied: IdentityTarget | null = null;
  #floor = 0;
  #currentGeneration = () => this.#options.currentIdentity().generation;

  constructor(options: Options) {
    this.#options = options;
    this.#seed = options.currentIdentity().generation;
    this.#buffer = new LaneBuffer({
      capacity: options.buffer.capacity,
      maxAge: options.buffer.maxAge,
      now: options.now,
      drop: this.#handleBufferDrop,
    });
  }

  status: ObservableValue<DestinationStatus> = {
    get: () => this.#state.get().status,
    subscribe: this.#state.subscribe,
  };

  native = () => {
    const current = this.#state.get();

    return current.state === "OPEN" ? current.native : null;
  };

  buffered = () => this.#buffer.size() + (this.#current === null ? 0 : 1);

  inFlight = () => this.#flights.size;

  start = () => {
    if (this.#opening) {
      this.#retryRequested = true;

      return;
    }

    const current = this.#state.get();

    if (current.state === "OPEN" || current.state === "DISPOSED") {
      return;
    }

    this.#opening = true;

    try {
      this.#attempt(current);

      const settled = this.#state.get();

      if (this.#retryRequested && settled.state === "FAILED") {
        this.#attempt(settled);
      }
    } finally {
      this.#opening = false;
      this.#retryRequested = false;
    }
  };

  enqueue = (entry: LaneEntry) => {
    const pending: Pending = {
      entry,
      handedOff: createDeferred<void>(),
      done: createDeferred<void>(),
    };

    const current = this.#state.get();

    if (current.state === "DISPOSED") {
      this.#land(pending, { status: "dropped", reason: "disposed" });

      return;
    }

    if (entry.event.identity.generation < this.#floor) {
      this.#land(pending, { status: "dropped", reason: "identity-changed" });

      return;
    }

    if (
      current.state === "OPEN" &&
      !this.#pumping &&
      this.#switching === null &&
      this.#buffer.size() === 0
    ) {
      this.#pump(pending);

      return;
    }

    this.#buffer.push(pending);
    this.#options.changed();
    this.#pump();
  };

  identityChanged = () => {
    if (this.#state.get().state === "DISPOSED") {
      return;
    }

    this.#passRequested = true;
    this.#pump();
  };

  dropBefore = (generation: number) => {
    this.#floor = Math.max(this.#floor, generation);

    const dropped = this.#take(
      ({ entry }) => entry.event.identity.generation < generation,
    );

    for (const pending of dropped) {
      this.#dropping.add(pending);
    }

    return () => {
      for (const pending of dropped) {
        this.#landDropped(pending);
      }
    };
  };

  consentChanged = () => {
    if (this.#state.get().state === "DISPOSED") {
      return;
    }

    if (!this.#options.isOpen()) {
      for (const pending of this.#take(() => true)) {
        this.#land(pending, { status: "dropped", reason: "consent" });
      }
    }

    this.#syncConsent();
  };

  flush = async ({
    timeout,
  }: {
    timeout: number;
  }): Promise<DestinationFlushResult> => {
    const open = this.#state.get();

    if (open.state !== "OPEN") {
      return NOT_READY;
    }

    const { now } = this.#options;
    const startedAt = now();

    const boundary = [
      ...(this.#current === null ? [] : [this.#current]),
      ...this.#buffer.values(),
      ...Array.from(this.#flights, ({ pending }) => pending),
    ];

    const controller = new AbortController();
    const expiry = createDeferred<DestinationFlushResult>();

    const handleExpiry = () => {
      controller.abort();
      expiry.resolve(TIMED_OUT);
    };

    const timer = setTimeout(handleExpiry, timeout);

    const handleDispose = () => {
      clearTimeout(timer);
      controller.abort();
      expiry.resolve(NOT_READY);
    };

    this.#waits.add(handleDispose);

    try {
      const waited = await Promise.race([
        expiry.promise,
        Promise.all(boundary.map(({ handedOff }) => handedOff.promise)).then(
          () => null,
        ),
      ]);

      if (waited !== null) {
        return waited;
      }

      if (this.#state.get() !== open) {
        return NOT_READY;
      }

      const remaining = Math.min(
        timeout,
        Math.max(0, timeout - (now() - startedAt)),
      );

      const called = this.#call(() =>
        typeof open.session.flush === "function"
          ? open.session.flush(
              Object.freeze({ timeout: remaining, signal: controller.signal }),
            )
          : UNSUPPORTED,
      );

      const answered =
        called.kind === "RESULT" && called.value === UNSUPPORTED
          ? UNSUPPORTED
          : getFlushResult(called);

      return await Promise.race([
        expiry.promise,
        Promise.all(boundary.map(({ done }) => done.promise)).then(
          () => answered,
        ),
      ]);
    } finally {
      clearTimeout(timer);
      this.#waits.delete(handleDispose);
    }
  };

  dispose = () => {
    const current = this.#state.get();

    if (current.state === "DISPOSED") {
      return;
    }

    this.#become(DISPOSED);

    for (const handleDispose of [...this.#waits]) {
      handleDispose();
    }

    const waiting = this.#take(() => true);
    const flights = [...this.#flights];

    for (const pending of [...this.#dropping]) {
      this.#landDropped(pending);
    }

    for (const pending of waiting) {
      this.#land(pending, { status: "dropped", reason: "disposed" });
    }

    for (const flight of flights) {
      flight.controller.abort();
      this.#landFlight(flight, { status: "indeterminate", reason: "disposed" });
    }

    if (current.state === "OPEN") {
      this.#release(current.session);
    }
  };

  #attempt(from: State) {
    const opened = this.#open();

    if (opened.kind === "FAILED") {
      this.#fail(from, opened.error);

      return;
    }

    if (opened.kind === "OPENED") {
      this.#ready(from, opened.state);

      return;
    }

    assertUnreachable(opened);
  }

  #open():
    { kind: "OPENED"; state: OpenState } | { kind: "FAILED"; error: unknown } {
    const { adapter, depth } = this.#options;

    depth.enter();

    try {
      return {
        kind: "OPENED",
        state: {
          state: "OPEN",
          status: READY_DESTINATION_STATUS,
          ...getOpenedSession(adapter.open()),
        },
      };
    } catch (error) {
      return { kind: "FAILED", error };
    } finally {
      depth.exit();
    }
  }

  #fail(from: State, error: unknown) {
    if (this.#state.get() !== from) {
      return;
    }

    const status: DestinationStatus = { state: "failed", error };

    Object.freeze(status);
    this.#become({ state: "FAILED", status });
  }

  #ready(from: State, opened: OpenState) {
    const consented = this.#options.isOpen();

    if (this.#state.get() === from && this.#options.gated) {
      this.#switchCollection(opened.session, consented);
    }

    if (this.#state.get() !== from) {
      this.#release(opened.session);

      return;
    }

    this.#consented = consented;
    this.#become(opened);

    if (this.#state.get() !== opened) {
      return;
    }

    this.#syncConsent();
    this.#passRequested = true;
    this.#pump();
  }

  #become(next: Exclude<State, { state: "IDLE" }>) {
    this.#state.set(next);

    if (this.#state.get() !== next) {
      return;
    }

    this.#record("destination", STATE_TYPES[next.state], null);
    this.#options.changed();
  }

  #syncConsent() {
    const current = this.#state.get();

    if (current.state !== "OPEN") {
      return;
    }

    const open = this.#options.isOpen();

    if (open === this.#consented) {
      return;
    }

    this.#consented = open;

    if (this.#options.gated) {
      this.#switchCollection(current.session, open);
    }

    if (open) {
      this.#passRequested = true;
      this.#pump();
    }
  }

  #pump(first: Pending | null = null) {
    if (this.#pumping || this.#state.get().state !== "OPEN") {
      return;
    }

    this.#pumping = true;
    // It never rejects: every adapter call inside is contained, and every entry it takes lands.
    this.#drain(first);
  }

  async #drain(first: Pending | null) {
    let next = first;

    try {
      for (;;) {
        if (this.#switching !== null) {
          await this.#waitForSwitch();
        }

        const open = this.#state.get();

        if (open.state !== "OPEN") {
          return;
        }

        const pending = next ?? this.#buffer.shift();

        next = null;

        if (pending === null && !this.#passRequested) {
          return;
        }

        if (pending === null) {
          this.#passRequested = false;
        }

        if (!this.#options.isOpen()) {
          if (pending !== null) {
            this.#land(pending, { status: "dropped", reason: "consent" });
          }

          continue;
        }

        this.#current = pending;

        const target =
          pending === null
            ? this.#options.currentIdentity()
            : pending.entry.identity;

        const { steps, next: planned } = planIdentity(
          this.#fresh
            ? { generation: this.#seed, user: null, traits: {}, groups: {} }
            : this.#applied,
          target,
          open.methods,
        );

        const event = pending === null ? null : pending.entry.event.id;

        let done = 0;
        let failed = false;

        this.#fresh = false;

        for (const step of steps) {
          if (this.#state.get() !== open) {
            return;
          }

          if (
            !this.#options.isOpen() ||
            this.#current !== pending ||
            (pending === null && target.generation < this.#floor)
          ) {
            break;
          }

          const called = this.#call(() => callIdentityStep(open.session, step));

          const answer =
            called.kind === "PENDING"
              ? await this.#awaitStep(called.promise, pending)
              : called;

          if (this.#switching !== null) {
            await this.#waitForSwitch();
          }

          if (this.#state.get() !== open) {
            return;
          }

          const failure = getStepFailure(step, answer);

          if (failure !== null) {
            this.#record(
              "identity",
              DIAGNOSTIC_TYPES.IDENTITY_STEP_FAILED,
              event,
              { step: step.kind, reason: failure },
            );
            failed = true;

            break;
          }

          if (answer.kind === "THREW") {
            this.#record(
              "identity",
              DIAGNOSTIC_TYPES.IDENTITY_STEP_UNSUPPORTED,
              event,
              { step: step.kind },
            );
          }

          done += 1;
        }

        this.#applied = done === steps.length ? planned : null;

        if (pending === null || this.#current !== pending) {
          continue;
        }

        this.#current = null;

        if (failed) {
          this.#land(pending, { status: "skipped", reason: "identity-failed" });

          continue;
        }

        if (!this.#options.isOpen()) {
          this.#land(pending, { status: "dropped", reason: "consent" });

          continue;
        }

        this.#handoff(open, pending);
      }
    } finally {
      this.#pumping = false;
    }
  }

  async #awaitStep(
    promise: Promise<unknown>,
    pending: Pending | null,
  ): Promise<StepAnswer> {
    const deadline = createDeferred<StepAnswer>();

    const timer = setTimeout(
      () => deadline.resolve(STEP_TIMEOUT),
      this.#options.timeout,
    );

    const handleDispose = () => {
      clearTimeout(timer);
      deadline.resolve(STEP_TIMEOUT);
    };

    unrefTimer(timer);
    this.#waits.add(handleDispose);

    const answered = Promise.race([
      deadline.promise,
      promise.then(
        (value): StepAnswer => ({ kind: "RESULT", value }),
        (error: unknown): StepAnswer => ({ kind: "THREW", error }),
      ),
    ]);

    if (pending !== null) {
      this.#options.changed();
    }

    try {
      return await answered;
    } finally {
      clearTimeout(timer);
      this.#waits.delete(handleDispose);
    }
  }

  #handoff(open: OpenState, pending: Pending) {
    const controller = new AbortController();

    const flight: Flight = {
      pending,
      controller,
      timer: setTimeout(() => {
        controller.abort();
        this.#landFlight(flight, {
          status: "indeterminate",
          reason: "timeout",
        });
      }, this.#options.timeout),
    };

    unrefTimer(flight.timer);
    this.#flights.add(flight);
    pending.handedOff.resolve();
    this.#options.changed();

    if (!this.#flights.has(flight)) {
      return;
    }

    const answer = this.#call(() =>
      open.session.track(
        pending.entry.event,
        Object.freeze({
          signal: controller.signal,
          currentGeneration: this.#currentGeneration,
          now: this.#options.now,
        }),
      ),
    );

    if (answer.kind === "THREW") {
      this.#landFlight(flight, { status: "failed", error: answer.error });

      return;
    }

    if (answer.kind === "PENDING") {
      // It never rejects: a rejection lands as failed, like every other answer.
      this.#landWhenAnswered(flight, answer.promise);

      return;
    }

    if (answer.kind === "RESULT") {
      this.#landFlight(
        flight,
        copyTrackResult(answer.value, pending.entry.losses),
      );

      return;
    }

    assertUnreachable(answer);
  }

  async #landWhenAnswered(flight: Flight, promise: Promise<unknown>) {
    let answer: unknown;

    try {
      answer = await promise;
    } catch (error) {
      this.#landFlight(flight, { status: "failed", error });

      return;
    }

    this.#landFlight(
      flight,
      copyTrackResult(answer, flight.pending.entry.losses),
    );
  }

  #landFlight(flight: Flight, outcome: DestinationOutcome) {
    if (!this.#flights.delete(flight)) {
      return;
    }

    clearTimeout(flight.timer);
    this.#land(flight.pending, outcome);
  }

  #land(pending: Pending, outcome: DestinationOutcome) {
    pending.entry.land(outcome);
    pending.handedOff.resolve();
    pending.done.resolve();
    this.#record(
      "event",
      OUTCOME_TYPES[outcome.status],
      pending.entry.event.id,
      getOutcomeContext(outcome),
    );
    this.#options.changed();
  }

  #landDropped(pending: Pending) {
    if (!this.#dropping.delete(pending)) {
      return;
    }

    this.#land(pending, { status: "dropped", reason: "identity-changed" });
  }

  #take(predicate: (pending: Pending) => boolean) {
    const current = this.#current;
    const taken = this.#buffer.remove(predicate);

    if (current === null || !predicate(current)) {
      return taken;
    }

    this.#current = null;

    return [current, ...taken];
  }

  #handleBufferDrop = (pending: Pending, reason: "overflow" | "expired") => {
    if (reason === "overflow") {
      this.#record(
        "destination",
        DIAGNOSTIC_TYPES.BUFFER_OVERFLOW,
        pending.entry.event.id,
        { capacity: this.#options.buffer.capacity },
      );
      this.#land(pending, { status: "dropped", reason: "buffer-overflow" });

      return;
    }

    if (this.#state.get().state === "FAILED") {
      this.#land(pending, { status: "skipped", reason: "start-failed" });

      return;
    }

    this.#land(pending, { status: "dropped", reason: "buffer-expired" });
  };

  #call(task: () => unknown): Answer {
    const { depth } = this.#options;

    depth.enter();

    try {
      return getAnswer(task());
    } catch (error) {
      return { kind: "THREW", error };
    } finally {
      depth.exit();
    }
  }

  #switchCollection(session: AnalyticsSession, enabled: boolean) {
    const answer = this.#call(() => session.collection?.(enabled));

    if (answer.kind === "THREW") {
      this.#record(
        "destination",
        DIAGNOSTIC_TYPES.DESTINATION_COLLECTION_FAILED,
        null,
        { enabled },
      );

      return;
    }

    if (answer.kind === "PENDING") {
      const switching = this.#awaitSwitch(answer.promise, enabled).then(() => {
        if (this.#switching === switching) {
          this.#switching = null;
        }
      });

      this.#switching = switching;

      return;
    }

    if (answer.kind === "RESULT") {
      return;
    }

    assertUnreachable(answer);
  }

  async #awaitSwitch(promise: Promise<unknown>, enabled: boolean) {
    const answer = await this.#awaitStep(promise, null);

    if (answer.kind !== "RESULT" && this.#state.get().state !== "DISPOSED") {
      this.#record(
        "destination",
        DIAGNOSTIC_TYPES.DESTINATION_COLLECTION_FAILED,
        null,
        { enabled },
      );
    }
  }

  async #waitForSwitch() {
    while (this.#switching !== null) {
      await this.#switching;
    }
  }

  #release(session: AnalyticsSession) {
    this.#contain(DIAGNOSTIC_TYPES.DESTINATION_DISPOSE_FAILED, undefined, () =>
      session.dispose?.(),
    );
  }

  #contain(
    type: DiagnosticRecord["type"],
    context: DiagnosticRecord["context"],
    task: () => unknown,
  ) {
    const answer = this.#call(task);

    if (answer.kind === "THREW") {
      this.#record("destination", type, null, context);

      return;
    }

    if (answer.kind === "PENDING") {
      answer.promise.catch(() => {
        this.#record("destination", type, null, context);
      });

      return;
    }

    if (answer.kind === "RESULT") {
      return;
    }

    assertUnreachable(answer);
  }

  #record(
    source: DiagnosticRecord["source"],
    type: DiagnosticRecord["type"],
    event: string | null,
    context?: DiagnosticRecord["context"],
  ) {
    this.#options.record({
      source,
      type,
      destination: this.#options.name,
      event,
      ...(context === undefined ? {} : { context }),
    });
  }
}
