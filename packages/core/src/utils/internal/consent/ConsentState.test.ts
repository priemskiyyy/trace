import { expect, test } from "vitest";

import type { ConsentDecision } from "src/types/ConsentDecision";
import { ConsentState } from "src/utils/internal/consent/ConsentState";

test("every declared purpose starts unknown, which keeps a destination that needs one closed", () => {
  const consent = new ConsentState({
    required: new Map([
      ["product", ["analytics"]],
      ["research", ["analytics", "research"]],
    ]),
  });

  expect(consent.decisions()).toEqual({
    analytics: "unknown",
    research: "unknown",
  });
  expect(Object.isFrozen(consent.decisions())).toBe(true);
  expect(consent.isOpen("product")).toBe(false);
  expect(consent.isOpen("research")).toBe(false);
});

test("a destination opens only once every purpose it needs is granted, and closes when one no longer is", () => {
  const consent = new ConsentState({
    required: new Map([["research", ["analytics", "research"]]]),
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
    required: new Map([["research", ["analytics", "research"]]]),
  });

  consent.set({ analytics: "granted", research: "denied" });

  expect(consent.isOpen("research")).toBe(false);
});

test("a destination that needs no purpose, or that the consent option does not name, is always open", () => {
  const consent = new ConsentState({
    required: new Map([
      ["product", ["analytics"]],
      ["console", []],
    ]),
  });

  const ungated = new ConsentState({ required: new Map() });

  expect(consent.isOpen("console")).toBe(true);
  expect(consent.isOpen("warehouse")).toBe(true);
  expect(ungated.isOpen("product")).toBe(true);
  expect(ungated.decisions()).toEqual({});
});

test("set applies what it can and refuses a purpose no destination declared, reporting it in a frozen list", () => {
  const consent = new ConsentState({
    required: new Map([["product", ["analytics"]]]),
  });

  const answer = consent.set({ analytics: "granted", marketing: "granted" });

  expect(answer).toEqual({ changed: true, refused: ["marketing"] });
  expect(Object.isFrozen(answer.refused)).toBe(true);
  expect(consent.decisions()).toEqual({ analytics: "granted" });
});

test("a decision that is not one of the three is refused and reported, and closes its purpose rather than keeping it open", () => {
  const consent = new ConsentState({
    required: new Map([["product", ["analytics"]]]),
  });

  consent.set({ analytics: "granted" });

  // @ts-expect-error A JavaScript caller can pass a decision that is not one of the three.
  expect(consent.set({ analytics: "revoked" })).toEqual({
    changed: true,
    refused: ["analytics"],
  });
  expect(consent.decisions()).toEqual({ analytics: "denied" });
  expect(consent.isOpen("product")).toBe(false);
});

test("set never throws, whatever it is given, and then changes nothing, reporting a list's index keys as purposes it refused", () => {
  const consent = new ConsentState({
    required: new Map([["product", ["analytics"]]]),
  });

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
  expect(consent.decisions()).toEqual({ analytics: "unknown" });
});

test("a class instance is read by its own keys, and a decision it only inherits is left alone", () => {
  class Decisions {
    analytics: ConsentDecision = "granted";

    get marketing(): ConsentDecision {
      return "granted";
    }
  }

  const consent = new ConsentState({
    required: new Map([["product", ["analytics", "marketing"]]]),
  });

  // @ts-expect-error A class has no index signature; the Trace's consent, typed by its purposes, accepts one.
  expect(consent.set(new Decisions())).toEqual({ changed: true, refused: [] });
  expect(consent.decisions()).toEqual({
    analytics: "granted",
    marketing: "unknown",
  });
});

test("a decision that changes replaces the frozen record, and one that changes nothing keeps it", () => {
  const consent = new ConsentState({
    required: new Map([["product", ["analytics"]]]),
  });

  const initial = consent.decisions();

  consent.set({ analytics: "granted" });

  const applied = consent.decisions();

  expect(applied).not.toBe(initial);
  expect(consent.set({ analytics: "granted" })).toEqual({
    changed: false,
    refused: [],
  });
  expect(consent.set({})).toEqual({ changed: false, refused: [] });
  expect(consent.decisions()).toBe(applied);
  expect(Object.isFrozen(applied)).toBe(true);
  expect(initial).toEqual({ analytics: "unknown" });
});

test("a purpose set to undefined counts as an invalid decision, so it is refused and closes", () => {
  const consent = new ConsentState({
    required: new Map([["product", ["analytics"]]]),
  });

  consent.set({ analytics: "granted" });

  expect(consent.set({ analytics: undefined })).toEqual({
    changed: true,
    refused: ["analytics"],
  });
  expect(consent.decisions()).toEqual({ analytics: "denied" });
  expect(consent.isOpen("product")).toBe(false);
});
