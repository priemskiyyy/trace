import type { DestinationHandle } from "@priemskiyyy/trace";
import { vi } from "vitest";

import type { RegisteredTrace } from "src/types/Register";

export const spyOnTrace = (trace: RegisteredTrace) => {
  const original = { ...trace };
  const calls: unknown[][] = [];
  const live: Record<string, number> = {};

  const handles = new WeakMap<
    DestinationHandle<unknown>,
    DestinationHandle<unknown>
  >();

  const recordSubscribe =
    <TListener>(name: string, subscribe: (listener: TListener) => () => void) =>
    (listener: TListener) => {
      calls.push([`${name}.subscribe`]);
      live[name] = (live[name] ?? 0) + 1;

      const release = subscribe(listener);

      return () => {
        calls.push([`${name}.release`]);
        live[name] = (live[name] ?? 0) - 1;
        release();
      };
    };

  const recordCall =
    <TArgs extends unknown[], TResult>(
      name: string,
      call: (...args: TArgs) => TResult,
    ) =>
    (...args: TArgs) => {
      calls.push([name, ...args]);

      return call(...args);
    };

  vi.spyOn(trace, "status", "get").mockReturnValue({
    ...original.status,
    subscribe: recordSubscribe("status", original.status.subscribe),
  });
  vi.spyOn(trace, "consent", "get").mockReturnValue({
    ...original.consent,
    subscribe: recordSubscribe("consent", original.consent.subscribe),
    set: recordCall("consent.set", original.consent.set),
  });
  vi.spyOn(trace, "events", "get").mockReturnValue({
    subscribe: recordSubscribe("events", original.events.subscribe),
  });
  vi.spyOn(trace, "diagnostics", "get").mockReturnValue({
    ...original.diagnostics,
    subscribe: recordSubscribe("diagnostics", original.diagnostics.subscribe),
    events: {
      subscribe: recordSubscribe(
        "diagnostics.events",
        original.diagnostics.events.subscribe,
      ),
    },
  });
  vi.spyOn(trace, "destination").mockImplementation((name) => {
    const handle = original.destination(name);
    const spied = handles.get(handle);

    if (spied !== undefined) {
      return spied;
    }

    const created = {
      status: {
        ...handle.status,
        subscribe: recordSubscribe(`${name}.status`, handle.status.subscribe),
      },
      get native() {
        return handle.native;
      },
    };

    handles.set(handle, created);

    return created;
  });
  vi.spyOn(trace, "start").mockImplementation(
    recordCall("start", original.start),
  );
  vi.spyOn(trace, "track").mockImplementation(
    recordCall("track", original.track),
  );
  vi.spyOn(trace, "user").mockImplementation(recordCall("user", original.user));
  vi.spyOn(trace, "traits").mockImplementation(
    recordCall("traits", original.traits),
  );
  vi.spyOn(trace, "group").mockImplementation(
    recordCall("group", original.group),
  );
  vi.spyOn(trace, "context").mockImplementation(
    recordCall("context", original.context),
  );
  vi.spyOn(trace, "scope").mockImplementation(
    recordCall("scope", original.scope),
  );
  vi.spyOn(trace, "flush").mockImplementation(
    recordCall("flush", original.flush),
  );
  vi.spyOn(trace, "dispose").mockImplementation(
    recordCall("dispose", original.dispose),
  );

  return { calls, live };
};
