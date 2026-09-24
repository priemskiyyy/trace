import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { createSimulatedServerProviders } from "example-shared/simulated/createSimulatedServerProviders";
import { forwardTrackedEvent } from "src/forwardTrackedEvent";
import { readRequestBody, trackedEventSchema } from "src/requests";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const send = async (response: ServerResponse, answer: Response) => {
  const body = await answer.text();

  response.writeHead(answer.status, {
    ...CORS_HEADERS,
    "content-type": "application/json",
  });
  response.end(body);
};

/**
 * A Node server for `POST /api/events`: it validates the HTTP destination's
 * wire event with Zod, then replays it through a per-request Trace to
 * simulated posthog-node and segment-node clients.
 */
export const createEventsServer = () => {
  const providers = createSimulatedServerProviders();

  const server = createServer(async (request, response) => {
    try {
      const { pathname } = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "OPTIONS") {
        response.writeHead(204, CORS_HEADERS);
        response.end();

        return;
      }

      if (request.method !== "POST" || pathname !== "/api/events") {
        await send(response, Response.json(null, { status: 404 }));

        return;
      }

      const parsed = trackedEventSchema.safeParse(
        await readRequestBody(request),
      );

      if (!parsed.success) {
        await send(response, Response.json(null, { status: 400 }));

        return;
      }

      const forwarded = await forwardTrackedEvent(providers, parsed.data);

      await send(response, Response.json(forwarded));
    } catch {
      await send(response, Response.json(null, { status: 400 }));
    }
  });

  const dispose = () =>
    new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        resolve();

        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);

          return;
        }

        resolve();
      });
      server.closeAllConnections();
    });

  return { server, providers, dispose };
};
