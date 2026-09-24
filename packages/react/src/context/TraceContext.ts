import { createContext } from "react";

import type { RegisteredTrace } from "src/types/Register";

export const TraceContext = createContext<RegisteredTrace | undefined>(
  undefined,
);
