import type { createOrdersBackend } from "example-shared/backend/createOrdersBackend";

export type OrdersBackend = ReturnType<typeof createOrdersBackend>;
