import type { GroupUpdate } from "src/types/GroupUpdate";
import type { IdentifyUpdate } from "src/types/IdentifyUpdate";
import type { TraitsUpdate } from "src/types/TraitsUpdate";

/**
 * One identity call a mock session recorded, with the update it received.
 *
 * @example
 * ```ts
 * expect(mock.sessions[0]?.identity).toEqual([{ kind: "identify", user: { id: "ada" } }]);
 * ```
 */
export type MockIdentityCall =
  | ({ kind: "identify" } & IdentifyUpdate)
  | ({ kind: "traits" } & TraitsUpdate)
  | ({ kind: "group" } & GroupUpdate)
  | { kind: "reset" };
