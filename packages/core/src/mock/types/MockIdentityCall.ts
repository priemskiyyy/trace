/**
 * One identity call a mock session recorded, with the update it received.
 *
 * @example
 * ```ts
 * expect(mock.sessions[0]?.identity).toEqual([{ kind: "identify", user: { id: "ada" } }]);
 * ```
 */
export type MockIdentityCall =
  | { kind: "identify"; user: { id: string } }
  | {
      kind: "traits";
      user: { id: string } | null;
      set: Record<string, unknown>;
      remove: string[];
    }
  | {
      kind: "group";
      user: { id: string } | null;
      group: {
        type: string;
        id: string | null;
        traits: Record<string, unknown>;
      };
    }
  | { kind: "reset" };
