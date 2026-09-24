import type { ConsentDecision } from "src/types/ConsentDecision";
import type { ObservableValue } from "src/types/ObservableValue";
import { ValueStore } from "src/utils/common/ValueStore";

const CONSENT_DECISIONS = Object.freeze({
  unknown: true,
  granted: true,
  denied: true,
} satisfies Record<ConsentDecision, true>);

const isConsentDecision = (value: unknown): value is ConsentDecision =>
  typeof value === "string" && Object.hasOwn(CONSENT_DECISIONS, value);

const getRequiredPurposes = <TPurpose extends string>(
  required: Partial<Record<string, TPurpose[]>>,
  destination: string,
) => {
  try {
    const purposes = required[destination];

    if (purposes === undefined) {
      return [];
    }

    if (!Array.isArray(purposes)) {
      return null;
    }

    const copied = [...purposes];

    return copied.every((purpose) => typeof purpose === "string")
      ? copied
      : null;
  } catch {
    return null;
  }
};

const getEntryNames = (required: object) => {
  try {
    const inherited: string[] = [];
    const seen = new Set<object>();

    let prototype = Reflect.getPrototypeOf(required);

    while (prototype !== null && prototype !== Object.prototype) {
      if (seen.has(prototype)) {
        return null;
      }

      seen.add(prototype);
      inherited.push(...Object.getOwnPropertyNames(prototype));
      prototype = Reflect.getPrototypeOf(prototype);
    }

    return { own: Object.getOwnPropertyNames(required), inherited };
  } catch {
    return null;
  }
};

const getDecisionEntries = (decisions: unknown): [string, unknown][] => {
  try {
    return typeof decisions === "object" && decisions !== null
      ? Object.entries(decisions)
      : [];
  } catch {
    return [];
  }
};

export class ConsentState<TPurpose extends string> {
  #required: Map<string, TPurpose[] | null> | null;
  #decisions: ValueStore<Record<TPurpose, ConsentDecision>>;

  state: ObservableValue<Record<TPurpose, ConsentDecision>>;

  constructor({
    required,
  }: {
    // A union, so a literal with an empty list still infers its purposes and the partial option is accepted.
    required: Record<string, TPurpose[]> | Partial<Record<string, TPurpose[]>>;
  }) {
    const names = getEntryNames(required);
    const gates = new Map<string, TPurpose[] | null>();
    const decisions: Record<string, ConsentDecision> = {};

    for (const destination of names?.own ?? []) {
      const purposes = getRequiredPurposes(required, destination);

      gates.set(destination, purposes);

      for (const purpose of purposes ?? []) {
        decisions[purpose] = "unknown";
      }
    }

    for (const destination of names?.inherited ?? []) {
      if (!gates.has(destination)) {
        gates.set(destination, null);
      }
    }

    this.#required = names === null ? null : gates;
    Object.freeze(decisions);
    this.#decisions = new ValueStore<Record<TPurpose, ConsentDecision>>(
      decisions,
    );
    this.state = this.#decisions.observable;
  }

  set = (decisions: Partial<Record<TPurpose, ConsentDecision>>) => {
    const current: Record<string, ConsentDecision> = this.#decisions.get();
    const next: Record<string, ConsentDecision> = { ...current };
    const refused: string[] = [];

    let changed = false;

    for (const [purpose, decision] of getDecisionEntries(decisions)) {
      if (!Object.hasOwn(current, purpose)) {
        refused.push(purpose);

        continue;
      }

      const applied = isConsentDecision(decision) ? decision : "denied";

      if (applied !== decision) {
        refused.push(purpose);
      }

      if (next[purpose] !== applied) {
        next[purpose] = applied;
        changed = true;
      }
    }

    if (changed) {
      Object.freeze(next);
      this.#decisions.set(next);
    }

    return { changed, refused };
  };

  isOpen = (destination: string) => {
    if (this.#required === null) {
      return false;
    }

    const purposes = this.#required.get(destination);

    if (purposes === undefined) {
      return true;
    }

    if (purposes === null) {
      return false;
    }

    const decisions = this.#decisions.get();

    return purposes.every((purpose) => decisions[purpose] === "granted");
  };
}
