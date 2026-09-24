import type { AnalyticsSession } from "src/types/AnalyticsSession";
import { getAnswer } from "src/utils/internal/destinations/getAnswer";
import { TraceError } from "src/utils/TraceError";

export const getOpenedSession = (session: AnalyticsSession) => {
  // A JavaScript adapter's open can answer anything.
  if (
    typeof session !== "object" ||
    session === null ||
    typeof session.track !== "function"
  ) {
    const answer = getAnswer(session);

    if (answer.kind === "PENDING") {
      answer.promise.catch(() => {});
    }

    throw new TraceError({
      code: "INVALID_ANSWER",
      message: "The adapter's open returned no session with a track function.",
    });
  }

  return {
    session,
    native: session.native,
    methods: {
      identify: typeof session.identify === "function",
      traits: typeof session.traits === "function",
      group: typeof session.group === "function",
      reset: typeof session.reset === "function",
    },
  };
};
