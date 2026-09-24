import type { HttpRequest } from "@priemskiyyy/trace-http";

import type { BackendState } from "example-shared/backend/types/BackendState";
import type { NetworkRequest } from "example-shared/backend/types/NetworkRequest";
import { createEventLog } from "example-shared/utils/createEventLog";
import { createValueStore } from "example-shared/utils/createValueStore";
import { wait } from "example-shared/utils/wait";

/**
 * Your own orders API and the client that calls it, inside the page. The lab
 * sets its latency, takes it offline or fails the next request, and every
 * request lands in the network log.
 */
export const createOrdersBackend = ({ latency }: { latency: number }) => {
  const requests = createEventLog<NetworkRequest>(30);

  const state = createValueStore<BackendState>({
    latency,
    offline: false,
    failNext: false,
  });

  let nextId = 1;

  const record = (entry: Omit<NetworkRequest, "id" | "at">) => {
    requests.add({ ...entry, id: nextId, at: Date.now() });
    nextId += 1;
  };

  const request = async ({ event, signal }: HttpRequest) => {
    const startedAt = Date.now();

    try {
      await wait(state.get().latency, signal);
    } catch (error) {
      record({
        event: { id: event.id, name: event.name },
        user: event.identity.user,
        outcome: "aborted",
        duration: Date.now() - startedAt,
      });

      throw error;
    }

    const current = state.get();

    if (current.offline || current.failNext) {
      state.set({ ...current, failNext: false });
      record({
        event: { id: event.id, name: event.name },
        user: event.identity.user,
        outcome: "failed",
        duration: Date.now() - startedAt,
      });

      throw new Error("The orders endpoint answered 503.");
    }

    record({
      event: { id: event.id, name: event.name },
      user: event.identity.user,
      outcome: "accepted",
      duration: Date.now() - startedAt,
    });

    return { id: `evt_${event.id.slice(0, 8)}` };
  };

  return {
    request,
    requests: requests.log,
    state,
    setLatency: (next: number) => {
      state.set({ ...state.get(), latency: next });
    },
    setOffline: (offline: boolean) => {
      state.set({ ...state.get(), offline });
    },
    failNextRequest: () => {
      state.set({ ...state.get(), failNext: true });
    },
  };
};
