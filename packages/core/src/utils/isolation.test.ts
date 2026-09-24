import { expect, test } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { MockIdentityCall } from "src/mock/types/MockIdentityCall";
import type { Receipt } from "src/types/Receipt";
import type { ReceiptStatus } from "src/types/ReceiptStatus";
import type { TrackedEvent } from "src/types/TrackedEvent";
import { assertUnreachable } from "src/utils/common/assertUnreachable";
import { event } from "src/utils/event";
import { Trace } from "src/utils/Trace";
import { TraceError } from "src/utils/TraceError";

type Identity = TrackedEvent["identity"];

type Held = Omit<Identity, "generation">;

type Call = MockIdentityCall | { kind: "track"; event: TrackedEvent };

type Pace = "all" | "one" | "third";

type Operation =
  | "alice"
  | "bob"
  | "carol"
  | "sign out"
  | "plan"
  | "no plan"
  | "workspace"
  | "team"
  | "leave workspace"
  | "track"
  | "revoke"
  | "grant"
  | "initialize"
  | "start";

type Watched = { receipt: Receipt; seen: ReceiptStatus[] };

const DESTINATIONS = ["immediate", "late", "held"];

const OPERATIONS: Operation[] = [
  "alice",
  "bob",
  "carol",
  "sign out",
  "plan",
  "no plan",
  "workspace",
  "team",
  "leave workspace",
  "track",
  "track",
  "track",
  "revoke",
  "grant",
  "initialize",
  "start",
];

const OUTCOMES = [
  "event submitted",
  "event dropped",
  "event skipped",
  "event failed",
  "event indeterminate",
];

const events = { "Checkout Started": event<{ n: number }>() };

const nextMacrotask = () => new Promise((resolve) => setImmediate(resolve));

const getSequence = (seed: number, length: number) => {
  const sequence: Operation[] = [];

  let state = seed;

  for (let index = 0; index < length; index += 1) {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    const operation =
      OPERATIONS[Math.floor((state / 4_294_967_296) * OPERATIONS.length)];

    if (operation === undefined) {
      throw new Error(`Seed ${seed} picked no operation at step ${index}.`);
    }

    sequence.push(operation);
  }

  return sequence;
};

const withoutNulls = (record: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(record).flatMap(([key, value]) => {
      if (value === null) {
        return [];
      }

      return [[key, value]];
    }),
  );

const getHandoffs = (log: Call[]) => {
  const handoffs: { event: TrackedEvent; held: Held }[] = [];

  let held: Held = { user: null, traits: {}, groups: {} };

  for (const call of log) {
    if (call.kind === "reset") {
      held = { user: null, traits: {}, groups: {} };
    } else if (call.kind === "identify") {
      held = { ...held, user: call.user };
    } else if (call.kind === "traits") {
      const traits = { ...held.traits, ...call.set };

      for (const key of call.remove) {
        delete traits[key];
      }

      held = { ...held, traits };
    } else if (call.kind === "group") {
      const groups = { ...held.groups };
      const { type, id, traits } = call.group;

      if (id === null) {
        delete groups[type];
      } else {
        groups[type] = { id, traits: withoutNulls(traits) };
      }

      held = { ...held, groups };
    } else if (call.kind === "track") {
      handoffs.push({ event: call.event, held });
    } else {
      assertUnreachable(call);
    }
  }

  return handoffs;
};

const createWorld = () => {
  const logs = new Map<string, Call[]>(DESTINATIONS.map((name) => [name, []]));
  const answers: (() => void)[] = [];
  const accepted = new Map<unknown, Identity>();
  const watched: Watched[] = [];
  const landings = new Map<string, number>();

  let initialized = false;
  let tracked = 0;

  let model: Identity = { generation: 0, user: null, traits: {}, groups: {} };

  const log = (name: string, call: Call) => {
    logs.get(name)?.push(call);
  };

  const immediate = createMockAdapter({
    name: "immediate",
    onTrack: ({ event: handed }) =>
      log("immediate", { kind: "track", event: handed }),
    onIdentity: (call) => log("immediate", call),
  });

  const late = createMockAdapter({
    name: "late",
    onOpen: () => {
      if (!initialized) {
        throw new TraceError({
          code: "NOT_INITIALIZED",
          message: "The late SDK is not initialized yet.",
        });
      }
    },
    onTrack: ({ event: handed }) =>
      log("late", { kind: "track", event: handed }),
    onIdentity: (call) => log("late", call),
  });

  const held = createMockAdapter({
    name: "held",
    hold: true,
    onTrack: (track) => {
      log("held", { kind: "track", event: track.event });
      answers.push(() => track.settle());
    },
    onIdentity: (call) =>
      new Promise<void>((resolve) => {
        answers.push(() => {
          log("held", call);
          resolve();
        });
      }),
  });

  const trace = new Trace({
    events,
    destinations: {
      immediate: immediate.adapter,
      late: late.adapter,
      held: held.adapter,
    },
    consent: { late: ["analytics"], held: ["analytics"] },
  });

  trace.diagnostics.events.subscribe(({ type, event: landed, destination }) => {
    if (!OUTCOMES.includes(type) || landed === null) {
      return;
    }

    const key = `${landed.id} ${destination?.name ?? "receipt"}`;

    landings.set(key, (landings.get(key) ?? 0) + 1);
  });
  trace.consent.set({ analytics: "granted" });
  trace.start();

  const signIn = (id: string) => {
    trace.user({ id, traits: { owner: id } });

    if (model.user?.id === id) {
      model = { ...model, traits: { ...model.traits, owner: id } };

      return;
    }

    const ended = model.user !== null;

    model = {
      generation: model.generation + 1,
      user: { id },
      traits: { ...(ended ? {} : model.traits), owner: id },
      groups: ended ? {} : model.groups,
    };
  };

  const join = (type: string, id: string, traits: Record<string, unknown>) => {
    trace.group(type, { id, traits });

    const current = model.groups[type];

    model = {
      ...model,
      groups: {
        ...model.groups,
        [type]: {
          id,
          traits:
            current?.id === id ? { ...current.traits, ...traits } : traits,
        },
      },
    };
  };

  const operations = {
    alice: () => signIn("alice"),
    bob: () => signIn("bob"),
    carol: () => signIn("carol"),
    "sign out": () => {
      trace.user(null);

      if (model.user !== null) {
        model = {
          generation: model.generation + 1,
          user: null,
          traits: {},
          groups: {},
        };
      }
    },
    plan: () => {
      trace.traits({ plan: "pro" });
      model = { ...model, traits: { ...model.traits, plan: "pro" } };
    },
    "no plan": () => {
      trace.traits({ plan: null });
      model = {
        ...model,
        traits: withoutNulls({ ...model.traits, plan: null }),
      };
    },
    workspace: () => join("workspace", "w_1", { tier: "team" }),
    team: () => join("team", "t_9", {}),
    "leave workspace": () => {
      trace.group("workspace", null);

      const groups = { ...model.groups };

      delete groups["workspace"];
      model = { ...model, groups };
    },
    track: () => {
      tracked += 1;
      accepted.set(tracked, model);

      const receipt = trace.track("Checkout Started", { n: tracked });
      const seen = [receipt.status.get()];

      receipt.status.subscribe(() => seen.push(receipt.status.get()));
      watched.push({ receipt, seen });
    },
    revoke: () => trace.consent.set({ analytics: "denied" }),
    grant: () => trace.consent.set({ analytics: "granted" }),
    initialize: () => {
      initialized = true;
    },
    start: () => trace.start(),
  } satisfies Record<Operation, () => void>;

  const answer = async (pace: Pace, index: number) => {
    if (pace === "all") {
      await drain();

      return;
    }

    if (pace === "one") {
      answers.shift()?.();
      await nextMacrotask();

      return;
    }

    if (pace === "third") {
      if (index % 3 === 2) {
        answers.shift()?.();
      }

      await nextMacrotask();

      return;
    }

    assertUnreachable(pace);
  };

  const drain = async () => {
    for (let turn = 0; turn < 1_000; turn += 1) {
      await nextMacrotask();

      const next = answers.shift();

      if (next === undefined) {
        return;
      }

      next();
    }

    throw new Error("The held destination never stopped asking.");
  };

  const finish = async () => {
    trace.consent.set({ analytics: "granted" });
    initialized = true;
    trace.start();
    await drain();
  };

  return {
    trace,
    logs,
    accepted,
    watched,
    landings,
    operations,
    answer,
    finish,
  };
};

const sweep = async (seeds: number[], pace: Pace) => {
  const users = new Map<string, Set<string>>(
    DESTINATIONS.map((name) => [name, new Set()]),
  );

  for (const seed of seeds) {
    const world = createWorld();

    for (const [index, operation] of getSequence(seed, 96).entries()) {
      world.operations[operation]();
      await world.answer(pace, index);
    }

    await world.finish();

    for (const [name, log] of world.logs) {
      for (const { event: handed, held } of getHandoffs(log)) {
        const { generation, ...identity } = handed.identity;
        const context = `seed ${seed}: ${name} was handed event ${handed.properties.n}`;

        expect(held, context).toEqual(identity);
        expect({ generation, ...identity }, context).toEqual(
          world.accepted.get(handed.properties.n),
        );
        users.get(name)?.add(identity.user?.id ?? "anonymous");
      }
    }

    const expected = new Map<string, number>();

    for (const { receipt, seen } of world.watched) {
      const [first] = seen;
      const final = seen.at(-1);
      const context = `seed ${seed}: receipt ${receipt.id}`;

      expect(
        seen.filter(({ state }) => state !== "pending"),
        context,
      ).toEqual([final]);
      await expect(receipt.settled, context).resolves.toBe(final);

      for (const [index, status] of seen.entries()) {
        const previous = seen[index - 1];

        if (previous?.state !== "pending" || status.state === "dropped") {
          continue;
        }

        for (const [name, outcome] of Object.entries(previous.outcomes)) {
          if (outcome !== null) {
            expect(status.outcomes[name], context).toBe(outcome);
          }
        }
      }

      if (first?.state === "dropped") {
        expected.set(`${receipt.id} receipt`, 1);
      } else {
        for (const name of Object.keys(first?.outcomes ?? {})) {
          expected.set(`${receipt.id} ${name}`, 1);
        }
      }
    }

    expect(world.landings, `seed ${seed}`).toEqual(expected);

    const notified = world.watched.map(({ seen }) => seen.length);

    world.trace.dispose();

    expect(
      world.watched.map(({ seen }) => seen.length),
      `seed ${seed}`,
    ).toEqual(notified);
    expect(world.landings, `seed ${seed}`).toEqual(expected);
  }

  expect(users).toEqual(
    new Map(
      DESTINATIONS.map((name) => [
        name,
        new Set(["anonymous", "alice", "bob", "carol"]),
      ]),
    ),
  );
};

test("seeds 1 to 20, with every held call answered before the next operation: no destination is handed an event under another identity than its own, and every receipt settles exactly once", async () => {
  await sweep(
    Array.from({ length: 20 }, (_, index) => index + 1),
    "all",
  );
});

test("seeds 21 to 40, with one held call answered per operation: no destination is handed an event under another identity than its own, and every receipt settles exactly once", async () => {
  await sweep(
    Array.from({ length: 20 }, (_, index) => index + 21),
    "one",
  );
});

test("seeds 41 to 60, with one held call answered every third operation: no destination is handed an event under another identity than its own, and every receipt settles exactly once", async () => {
  await sweep(
    Array.from({ length: 20 }, (_, index) => index + 41),
    "third",
  );
});
