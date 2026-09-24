import { vi } from "vitest";

import type { ObservedTrace } from "src/types/internal/ObservedTrace";

type Subscription = "diagnostics" | "diagnostics.events" | "events";

export const spyOnTrace = (trace: ObservedTrace) => {
  const { diagnostics, events } = trace;
  const live = { diagnostics: 0, "diagnostics.events": 0, events: 0 };

  const count =
    <TListener>(
      name: Subscription,
      subscribe: (listener: TListener) => () => void,
    ) =>
    (listener: TListener) => {
      live[name] += 1;

      const release = subscribe(listener);

      return () => {
        live[name] -= 1;
        release();
      };
    };

  vi.spyOn(trace, "diagnostics", "get").mockReturnValue({
    ...diagnostics,
    subscribe: count("diagnostics", diagnostics.subscribe),
    events: {
      subscribe: count("diagnostics.events", diagnostics.events.subscribe),
    },
  });
  vi.spyOn(trace, "events", "get").mockReturnValue({
    subscribe: count("events", events.subscribe),
  });

  return { live };
};
