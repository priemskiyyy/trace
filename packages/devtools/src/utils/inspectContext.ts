import { isSensitiveKey } from "@priemskiyyy/trace";

export const inspectContext = (context: unknown) => {
  const seen = new WeakSet<object>();
  let remaining = 200;

  const inspect = (value: unknown, depth: number): unknown => {
    if (depth > 6) {
      return "[Truncated]";
    }

    remaining -= 1;

    if (typeof value === "string") {
      if (value.length <= 2_000) {
        return value;
      }

      return `${value.slice(0, 2_000)}… [Truncated]`;
    }

    if (typeof value === "bigint") {
      return `${value}n`;
    }

    if (typeof value === "function" || typeof value === "symbol") {
      return `[${typeof value}]`;
    }

    if (typeof value !== "object" || value === null) {
      return value;
    }

    if (seen.has(value)) {
      return "[Circular or repeated reference]";
    }

    seen.add(value);

    const isList = Array.isArray(value);

    // Descriptors, so no getter, proxy get trap or toJSON runs while the copy is made.
    const entries = Object.entries(
      Object.getOwnPropertyDescriptors(value),
    ).flatMap((entry) => {
      if (isList && entry[0] === "length") {
        return [];
      }

      return [entry];
    });

    const copied: [string, unknown][] = [];
    let isTruncated = entries.length > 50;

    for (const [key, descriptor] of entries.slice(0, 50)) {
      if (remaining === 0) {
        isTruncated = true;

        break;
      }

      if (isSensitiveKey(key)) {
        copied.push([key, "[Redacted]"]);

        continue;
      }

      if (!("value" in descriptor)) {
        copied.push([key, "[Accessor]"]);

        continue;
      }

      copied.push([key, inspect(descriptor.value, depth + 1)]);
    }

    if (isTruncated) {
      copied.push(["…", "[Truncated]"]);
    }

    if (isList) {
      return copied.map(([, item]) => item);
    }

    return Object.fromEntries(copied);
  };

  return inspect(context, 0);
};
