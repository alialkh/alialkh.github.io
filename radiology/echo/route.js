// Pure hash parser so node can test the router. Null means no such page.
export function parseRoute(hash, screens) {
  const [, id = '', arg] = hash.split('/');
  if (!screens.has(id)) return null;
  try {
    return { id, arg: arg ? decodeURIComponent(arg) : undefined };
  } catch {
    return null;
  }
}
