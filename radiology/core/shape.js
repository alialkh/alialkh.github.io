// Checks parsed JSON against a shape and collects every problem with the field named.
// A field is a type name (a trailing ? makes it optional), a list of allowed values, or a nested shape.
// A type is [label, test]. Areas add their own types with { ...TYPES, name: [label, test] }.
export const TYPES = {
  id: ['a kebab-case id', v => typeof v === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)],
  text: ['non-empty text', v => typeof v === 'string' && v.trim() !== ''],
  string: ['a string', v => typeof v === 'string'],
  texts: ['a list of non-empty text', v => Array.isArray(v) && v.every(TYPES.text[1])],
  ids: ['a list of kebab-case ids', v => Array.isArray(v) && v.every(TYPES.id[1])],
  bool: ['true or false', v => typeof v === 'boolean'],
  positive: ['a positive number', v => Number.isFinite(v) && v > 0],
  list: ['a list', Array.isArray],
};

export function checkShape(value, shape, where, problems, types = TYPES) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    problems.push(`${where} must be an object`);
    return;
  }
  for (const [key, spec] of Object.entries(shape)) {
    const v = value[key];
    const at = `${where}.${key}`;
    if (Array.isArray(spec)) {
      if (!spec.includes(v)) problems.push(`${at} is ${JSON.stringify(v)}, expected one of ${spec.join(', ')}`);
    } else if (typeof spec === 'object') {
      checkShape(v, spec, at, problems, types);
    } else if (!(spec.endsWith('?') && v === undefined)) {
      const [label, ok] = types[spec.replace('?', '')];
      if (!ok(v)) problems.push(`${at} must be ${label}`);
    }
  }
}
