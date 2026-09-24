import type { ObservableValue } from "@priemskiyyy/trace";
import { useSyncExternalStore } from "react";

export const useObservable = <T>(observable: ObservableValue<T>) =>
  useSyncExternalStore(observable.subscribe, observable.get, observable.get);
