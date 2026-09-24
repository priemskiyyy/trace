import type { AnalyticsSession } from "src/types/AnalyticsSession";
import type { IdentityStep } from "src/types/internal/IdentityStep";
import { assertUnreachable } from "src/utils/common/assertUnreachable";
import { TraceError } from "src/utils/TraceError";

const createMissingMethodError = () =>
  new TraceError({
    code: "UNSUPPORTED",
    message: "The session has no method for this identity step.",
  });

export const callIdentityStep = (
  session: AnalyticsSession,
  step: IdentityStep,
) => {
  if (step.kind === "reset") {
    if (typeof session.reset !== "function") {
      throw createMissingMethodError();
    }

    return session.reset();
  }

  if (step.kind === "identify") {
    if (typeof session.identify !== "function") {
      throw createMissingMethodError();
    }

    return session.identify(Object.freeze({ user: step.user }));
  }

  if (step.kind === "traits") {
    if (typeof session.traits !== "function") {
      throw createMissingMethodError();
    }

    return session.traits(
      Object.freeze({ user: step.user, set: step.set, remove: step.remove }),
    );
  }

  if (step.kind === "group") {
    if (typeof session.group !== "function") {
      throw createMissingMethodError();
    }

    return session.group(Object.freeze({ user: step.user, group: step.group }));
  }

  return assertUnreachable(step);
};
