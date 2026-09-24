export const readId = (member: { id: string }): unknown => {
  try {
    return member.id;
  } catch {
    return undefined;
  }
};
