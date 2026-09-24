import type { GtagLike } from "@priemskiyyy/trace-google-analytics";

import type { ProviderCall } from "example-shared/simulated/types/ProviderCall";
import { createEventLog } from "example-shared/utils/createEventLog";

/** The `gtag` function a Google tag snippet would define, queuing nothing since there is no gtag.js to load. */
export const createSimulatedGtag = () => {
  const inbox = createEventLog<ProviderCall>(20);
  let userId: string | null = null;

  const sdk = ((...command: unknown[]) => {
    const [name, target, parameters] = command;

    if (typeof parameters !== "object" || parameters === null) {
      return;
    }

    if (name === "event" && typeof target === "string") {
      inbox.add({
        id: crypto.randomUUID(),
        eventName: target,
        user: userId,
        body: parameters,
        at: Date.now(),
      });

      return;
    }

    if (name === "config" && "user_id" in parameters) {
      userId =
        typeof parameters.user_id === "string" ? parameters.user_id : null;
    }
  }) satisfies GtagLike;

  return { sdk, inbox: inbox.log };
};
