import type { ObservableValue } from "@priemskiyyy/trace";

export type ValueStore<T> = ObservableValue<T> & { set: (next: T) => void };
