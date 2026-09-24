import type { TrackedEvent } from "src/types/TrackedEvent";

export const resolveRoute = <TName extends string>({
  configured,
  to,
  event,
}: {
  configured: TName[];
  to: unknown;
  event: TrackedEvent | null;
}): TName[] | null => {
  if (to === undefined || (typeof to === "function" && event === null)) {
    return [...configured];
  }

  try {
    const names: unknown = typeof to === "function" ? to(event) : to;

    if (!Array.isArray(names)) {
      return null;
    }

    return configured.filter((name) => names.includes(name));
  } catch {
    return null;
  }
};
