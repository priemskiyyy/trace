const VISIBLE_LENGTH = 8;

export const formatEventId = (event: { id: string } | null) => {
  if (event === null) {
    return "";
  }

  return event.id.slice(0, VISIBLE_LENGTH);
};
