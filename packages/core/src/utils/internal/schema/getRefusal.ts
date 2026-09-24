import type { ParseResult } from "src/types/ParseResult";

export const getRefusal = (message: string): ParseResult<never> => ({
  ok: false,
  issues: [{ path: "", message }],
});
