export type IdentityStep =
  | { kind: "reset" }
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
    };
