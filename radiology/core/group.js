// Map.groupBy needs Safari 17.4, which older iPhones cannot install.
export const groupBy = (items, keyOf) => items.reduce((m, x) => m.set(keyOf(x), [...(m.get(keyOf(x)) ?? []), x]), new Map());
