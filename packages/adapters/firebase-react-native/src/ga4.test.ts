import { event } from "@priemskiyyy/trace";
import type { TrackedEvent } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { ga4 } from "src/ga4";
import { createTrackedEvent } from "src/trackedEvent.fixture";
import type { Ga4Event } from "src/types/Ga4Event";

const events = {
  "Checkout Started": event<{ total: number }>(),
  "Internal Ping": event(),
};

test("the map answers each event with its own mapping, which receives the event itself", () => {
  const seen: TrackedEvent[] = [];

  const map = ga4(events, {
    "Checkout Started": (tracked) => {
      seen.push(tracked);

      return {
        name: "begin_checkout",
        parameters: { value: tracked.properties.total },
      };
    },
    "Internal Ping": () => null,
  });

  const checkout = createTrackedEvent({
    name: "Checkout Started",
    properties: { total: 49.5 },
  });

  expect(map(checkout)).toEqual({
    name: "begin_checkout",
    parameters: { value: 49.5 },
  });
  expect(seen).toHaveLength(1);
  expect(seen[0]).toBe(checkout);
});

test("a mapping that answers null makes the map answer null", () => {
  const map = ga4(events, {
    "Checkout Started": () => null,
    "Internal Ping": () => null,
  });

  expect(map(createTrackedEvent({ name: "Internal Ping" }))).toBeNull();
});

test.each([
  "Checkout Finished",
  "toString",
  "constructor",
  "hasOwnProperty",
  "__proto__",
])(
  "an event the registry does not declare, %j, is answered null, never by an inherited member",
  (name) => {
    const map = ga4(events, {
      "Checkout Started": () => ({ name: "begin_checkout", parameters: {} }),
      "Internal Ping": () => ({ name: "app_ping", parameters: {} }),
    });

    expect(map(createTrackedEvent({ name }))).toBeNull();
  },
);

test("the mappings are read once, so changing the object afterwards changes nothing", () => {
  const mappings = {
    "Checkout Started": (): Ga4Event | null => null,
    "Internal Ping": (): Ga4Event | null => null,
  };

  const map = ga4(events, mappings);

  mappings["Checkout Started"] = () => ({
    name: "begin_checkout",
    parameters: {},
  });

  expect(map(createTrackedEvent({ name: "Checkout Started" }))).toBeNull();
});
