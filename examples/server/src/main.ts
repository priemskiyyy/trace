import { createEventsServer } from "src/createEventsServer";

const port = Number.parseInt(process.env.PORT ?? "4319", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const host = createEventsServer();

host.server.listen(port, "0.0.0.0", () => {
  console.log(`Trace events endpoint: http://localhost:${port}/api/events`);
});

const shutdown = () => {
  host.dispose().catch(console.error);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
