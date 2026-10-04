/** True when the critic marked any note `block` (publishing then needs `force`). */
export const hasBlockNote = (notes: unknown): boolean =>
  Array.isArray(notes) && notes.some((n) => (n as { severity?: string }).severity === "block");
