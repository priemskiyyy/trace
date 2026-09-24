import { expect, test, vi } from "vitest";

import type { ConsentDecision } from "src/types/ConsentDecision";
import { ConsentState } from "src/utils/internal/consent/ConsentState";

test("every declared purpose starts unknown, which keeps a destination that needs one closed", () => {
  const consent = new ConsentState({
    required: { product: ["analytics"], research: ["analytics", "research"] },
  });

  expect(consent.state.get()).toEqual({
    analytics: "unknown",
    research: "unknown",
  });
  expect(Object.isFrozen(consent.state.get())).toBe(true);
  expect(consent.isOpen("product")).toBe(false);
  expect(consent.isOpen("research")).toBe(false);
});

test("a destination opens only once every purpose it needs is granted, and closes when one no longer is", () => {
  const consent = new ConsentState({
    required: { research: ["analytics", "research"] },
  });

  consent.set({ analytics: "granted" });
  expect(consent.isOpen("research")).toBe(false);

  consent.set({ research: "granted" });
  expect(consent.isOpen("research")).toBe(true);

  consent.set({ research: "unknown" });
  expect(consent.isOpen("research")).toBe(false);
});

test("one denied purpose closes the destination, whatever the others say", () => {
  const consent = new ConsentState({
    required: { research: ["analytics", "research"] },
  });

  consent.set({ analytics: "granted", research: "denied" });

  expect(consent.isOpen("research")).toBe(false);
});

test("a destination that needs no purpose, or that the consent option does not name, is always open", () => {
  const consent = new ConsentState({
    required: { product: ["analytics"], console: [] },
  });

  const ungated = new ConsentState({ required: {} });

  expect(consent.isOpen("console")).toBe(true);
  expect(consent.isOpen("warehouse")).toBe(true);
  expect(ungated.isOpen("product")).toBe(true);
  expect(ungated.state.get()).toEqual({});
});

test("consent fails closed when reading a destination's purposes throws", () => {
  const required = {
    get product(): string[] {
      throw new Error("consent lookup exploded");
    },
    research: ["analytics"],
  };

  const consent = new ConsentState({ required });

  consent.set({ analytics: "granted" });

  expect(consent.isOpen("product")).toBe(false);
  expect(consent.isOpen("research")).toBe(true);
});

test("consent fails closed when a destination names something that is not a list of purposes", () => {
  const consent = new ConsentState({
    required: {
      // @ts-expect-error A JavaScript caller can name one purpose instead of a list.
      product: "analytics",
      // @ts-expect-error A JavaScript caller can list a purpose that is not a string.
      research: ["analytics", 7],
      web: ["analytics"],
    },
  });

  consent.set({ analytics: "granted" });
  consent.set({ 7: "granted" });

  expect(consent.state.get()).toEqual({ analytics: "granted" });
  expect(consent.isOpen("product")).toBe(false);
  expect(consent.isOpen("research")).toBe(false);
  expect(consent.isOpen("web")).toBe(true);
});

test("the purposes a destination needs are read once, so changing the option later cannot open it", () => {
  const purposes = ["analytics"];
  const required: Record<string, string[]> = { product: purposes };
  const consent = new ConsentState({ required });

  purposes.pop();
  required.research = [];

  expect(consent.isOpen("product")).toBe(false);
  expect(consent.isOpen("research")).toBe(true);
  expect(consent.state.get()).toEqual({ analytics: "unknown" });
});

test("set applies what it can and refuses a purpose no destination declared, reporting it", () => {
  const consent = new ConsentState({ required: { product: ["analytics"] } });

  expect(
    // @ts-expect-error An untyped caller named a purpose no destination declared.
    consent.set({ analytics: "granted", marketing: "granted" }),
  ).toEqual({ changed: true, refused: ["marketing"] });
  expect(consent.state.get()).toEqual({ analytics: "granted" });
});

test("a decision that is not one of the three is refused and reported, and closes its purpose rather than keeping it open", () => {
  const consent = new ConsentState({ required: { product: ["analytics"] } });

  consent.set({ analytics: "granted" });

  // @ts-expect-error A JavaScript caller can pass a decision that is not one of the three.
  expect(consent.set({ analytics: "revoked" })).toEqual({
    changed: true,
    refused: ["analytics"],
  });
  expect(consent.state.get()).toEqual({ analytics: "denied" });
  expect(consent.isOpen("product")).toBe(false);
});

test("set never throws, whatever it is given, and then changes nothing, reporting a list's index keys as purposes it refused", () => {
  const consent = new ConsentState({ required: { product: ["analytics"] } });

  const unreadable = {
    get analytics(): ConsentDecision {
      throw new Error("decision lookup exploded");
    },
  };

  const nothing = { changed: false, refused: [] };

  // @ts-expect-error An untyped caller passed null instead of decisions.
  expect(consent.set(null)).toEqual(nothing);
  // @ts-expect-error An untyped caller passed a decision without its purpose.
  expect(consent.set("granted")).toEqual(nothing);
  // @ts-expect-error An untyped caller passed a list instead of decisions.
  expect(consent.set(["granted"])).toEqual({ changed: false, refused: ["0"] });
  expect(consent.set(unreadable)).toEqual(nothing);
  expect(consent.state.get()).toEqual({ analytics: "unknown" });
});

test("a class instance the types accept is read by its own keys, and a decision it only inherits is left alone", () => {
  class Decisions {
    analytics: ConsentDecision = "granted";

    get marketing(): ConsentDecision {
      return "granted";
    }
  }

  const consent = new ConsentState({
    required: { product: ["analytics", "marketing"] },
  });

  expect(consent.set(new Decisions())).toEqual({ changed: true, refused: [] });
  expect(consent.state.get()).toEqual({
    analytics: "granted",
    marketing: "unknown",
  });
});

test("an unchanged decision keeps the same frozen record and notifies nobody", () => {
  const consent = new ConsentState({ required: { product: ["analytics"] } });

  consent.set({ analytics: "granted" });

  const applied = consent.state.get();
  const listener = vi.fn();

  consent.state.subscribe(listener);

  expect(consent.set({ analytics: "granted" })).toEqual({
    changed: false,
    refused: [],
  });
  expect(consent.set({})).toEqual({ changed: false, refused: [] });
  expect(consent.state.get()).toBe(applied);
  expect(Object.isFrozen(applied)).toBe(true);
  expect(listener).not.toHaveBeenCalled();
});

test("observers hear every decision that actually changed", () => {
  const consent = new ConsentState({ required: { product: ["analytics"] } });
  const seen: unknown[] = [];

  consent.state.subscribe(() => seen.push(consent.state.get()));

  consent.set({ analytics: "granted" });
  consent.set({ analytics: "denied" });

  expect(seen).toEqual([{ analytics: "granted" }, { analytics: "denied" }]);
});

test("an entry the consent option only inherits keeps its destination closed, while an unnamed one stays open", () => {
  class Required {
    get product(): string[] {
      return ["analytics"];
    }
  }

  const inherited = new ConsentState({
    // @ts-expect-error A literal's __proto__ sets its prototype, which the types read as a property.
    required: { __proto__: { product: ["analytics"] } },
  });

  const fromClass = new ConsentState({
    // @ts-expect-error A class keeps its entries on its prototype, where no index signature reaches.
    required: new Required(),
  });

  inherited.set({ analytics: "granted" });
  fromClass.set({ analytics: "granted" });

  expect(inherited.isOpen("product")).toBe(false);
  expect(fromClass.isOpen("product")).toBe(false);
  expect(inherited.isOpen("warehouse")).toBe(true);
  expect(fromClass.isOpen("warehouse")).toBe(true);
});

test("a consent option that cannot be read closes every destination", () => {
  const required = new Proxy(
    {},
    {
      ownKeys: () => {
        throw new Error("consent keys exploded");
      },
    },
  );

  const consent = new ConsentState({ required });

  expect(consent.isOpen("product")).toBe(false);
  expect(consent.isOpen("warehouse")).toBe(false);
  expect(consent.state.get()).toEqual({});
});

test("a destination's list of purposes is read once, so the list that was checked is the list that is kept", () => {
  const purposes = ["analytics"];

  let reads = 0;

  Object.defineProperty(purposes, 0, {
    enumerable: true,
    get: () => {
      reads += 1;

      return reads === 1 ? "analytics" : 7;
    },
  });

  const consent = new ConsentState({ required: { product: purposes } });

  expect(consent.state.get()).toEqual({ analytics: "unknown" });
  expect(reads).toBe(1);
});

test("a purpose set to undefined counts as an invalid decision, so it is refused and closes", () => {
  const consent = new ConsentState({ required: { product: ["analytics"] } });

  consent.set({ analytics: "granted" });

  // @ts-expect-error A caller without exactOptionalPropertyTypes can pass undefined for a purpose.
  expect(consent.set({ analytics: undefined })).toEqual({
    changed: true,
    refused: ["analytics"],
  });
  expect(consent.state.get()).toEqual({ analytics: "denied" });
  expect(consent.isOpen("product")).toBe(false);
});

test("a consent option whose prototypes never end closes every destination instead of looping", () => {
  const required: Record<string, string[]> = new Proxy<
    Record<string, string[]>
  >({}, { getPrototypeOf: () => required });

  const consent = new ConsentState({ required });

  expect(consent.isOpen("product")).toBe(false);
  expect(consent.isOpen("warehouse")).toBe(false);
});
