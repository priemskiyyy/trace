import { Trace, event } from "@priemskiyyy/trace";
import type { Destinations, EventDefinition } from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";

const events: Record<string, EventDefinition<never, unknown>> = {
  "App Opened": event(),
};

export const createTrace = () => {
  const mock = createMockAdapter({ name: "mocked" });

  const trace = new Trace<
    Record<string, EventDefinition<never, unknown>>,
    Destinations
  >({ events, destinations: { primary: mock.adapter } });

  return { mock, trace };
};
