import type { IncomingMessage } from "node:http";
import { z } from "zod";

/** The wire form of a Trace `TrackedEvent`, as the HTTP destination's `request` sends it with `JSON.stringify(event)`. */
export const trackedEventSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1),
    properties: z.record(z.string(), z.unknown()),
    context: z.record(z.string(), z.unknown()),
    identity: z.object({
      generation: z.number(),
      user: z.object({ id: z.string() }).nullable(),
      traits: z.record(z.string(), z.unknown()),
      groups: z.record(
        z.string(),
        z.object({ id: z.string(), traits: z.record(z.string(), z.unknown()) }),
      ),
    }),
    timestamp: z.number(),
  })
  .strict();

export const readRequestBody = async (
  request: IncomingMessage,
): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const input: unknown = chunk;
    const bytes = typeof input === "string" ? Buffer.from(input) : input;

    if (!Buffer.isBuffer(bytes)) {
      throw new Error("Expected a byte stream.");
    }

    size += bytes.length;

    if (size > 16_384) {
      throw new Error("Request is too large.");
    }

    chunks.push(bytes);
  }

  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));

  return body;
};
