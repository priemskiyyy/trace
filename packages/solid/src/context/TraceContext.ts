import { createContext } from "solid-js";
import type { Accessor } from "solid-js";

import type { RegisteredTrace } from "src/types/Register";

export const TraceContext = createContext<Accessor<RegisteredTrace>>();
