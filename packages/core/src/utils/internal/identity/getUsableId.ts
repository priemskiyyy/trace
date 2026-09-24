export const getUsableId = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value : null;
