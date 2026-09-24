import type { ConsentDecision } from "src/types/ConsentDecision";

const CONSENT_DECISIONS = Object.freeze({
  unknown: true,
  granted: true,
  denied: true,
} satisfies Record<ConsentDecision, true>);

const isConsentDecision = (value: unknown): value is ConsentDecision =>
  typeof value === "string" && Object.hasOwn(CONSENT_DECISIONS, value);

const getDecisionEntries = (decisions: unknown): [string, unknown][] => {
  try {
    return typeof decisions === "object" && decisions !== null
      ? Object.entries(decisions)
      : [];
  } catch {
    return [];
  }
};

export class ConsentState {
  #required: Map<string, string[]>;
  #decisions: Record<string, ConsentDecision>;

  constructor({ required }: { required: Map<string, string[]> }) {
    const decisions: Record<string, ConsentDecision> = {};

    for (const purposes of required.values()) {
      for (const purpose of purposes) {
        decisions[purpose] = "unknown";
      }
    }

    Object.freeze(decisions);
    this.#required = required;
    this.#decisions = decisions;
  }

  decisions = () => this.#decisions;

  set = (decisions: Partial<Record<string, ConsentDecision>>) => {
    const current = this.#decisions;
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

    Object.freeze(refused);

    if (changed) {
      Object.freeze(next);
      this.#decisions = next;
    }

    return { changed, refused };
  };

  isOpen = (destination: string) => {
    const purposes = this.#required.get(destination);

    if (purposes === undefined) {
      return true;
    }

    return purposes.every((purpose) => this.#decisions[purpose] === "granted");
  };
}
