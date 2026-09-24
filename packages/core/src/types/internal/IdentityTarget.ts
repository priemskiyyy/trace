import type { IdentityGroup } from "src/types/internal/IdentityGroup";

export type IdentityTarget = {
  generation: number;
  user: { id: string } | null;
  traits: Record<string, unknown>;
  groups: Record<string, IdentityGroup | null>;
};
