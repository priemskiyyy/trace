import type { ComputedRef, InjectionKey } from "vue";

import type { RegisteredTrace } from "src/types/Register";

export const TRACE_CONTEXT: InjectionKey<ComputedRef<RegisteredTrace>> =
  Symbol("trace");
