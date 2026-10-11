// Pure. The hash is #/<case id>. Anything else, echo's old #/atlas and #/quiz links included, opens the first case.
// notice is true when the link named something that is not a case, so the page can say why it moved.
export function resolveRoute(hash, ids) {
  const id = hash.replace(/^#\/?/, '');
  if (ids.includes(id)) return { id, notice: false };
  return { id: ids[0] ?? null, notice: id !== '' && ids.length > 0 };
}
