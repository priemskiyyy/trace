import type { GroupUpdate } from "src/types/GroupUpdate";
import type { IdentifyUpdate } from "src/types/IdentifyUpdate";
import type { TraitsUpdate } from "src/types/TraitsUpdate";

export type IdentityStep =
  | { kind: "reset" }
  | ({ kind: "identify" } & IdentifyUpdate)
  | ({ kind: "traits" } & TraitsUpdate)
  | ({ kind: "group" } & GroupUpdate);
