// JSON Schema validation (draft 2020-12 core and validation vocabularies, plus the draft-07 spellings of
// definitions/items/additionalItems/dependencies). No DOM access.
//
// Not supported, and reported as warnings instead of being silently ignored: unevaluatedProperties,
// unevaluatedItems, $dynamicRef, $recursiveRef, and $ref to anything outside the schema text itself.

export class SchemaError extends Error {}

const IGNORED_WITH_WARNING = ['unevaluatedProperties', 'unevaluatedItems', '$dynamicRef', '$recursiveRef', '$dynamicAnchor'];
const MAX_DEPTH = 100;

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInteger = (v) => typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);

function typeMatches(value, type) {
  switch (type) {
    case 'integer': return isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'null': case 'boolean': case 'string': case 'array': case 'object': return typeOf(value) === type;
    default: throw new SchemaError(`Unknown type "${type}" in the schema; use one of null, boolean, object, array, number, integer, string.`);
  }
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}

const show = (v) => {
  const text = JSON.stringify(v);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};

const pathText = (segments) => segments.reduce((s, seg) => s + (typeof seg === 'number' ? `[${seg}]` : `['${String(seg).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`), '$');

/** Number of Unicode characters, which is what maxLength and minLength count (not UTF-16 units). */
const lengthOf = (s) => [...s].length;

// ---- formats ----------------------------------------------------------------------------------------------------

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
function validTime(s) {
  const m = /^(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/i.exec(s);
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59 && Number(m[3]) <= 60 && (!m[6] || (Number(m[6]) <= 23 && Number(m[7]) <= 59));
}
function validIpv4(s) {
  const parts = s.split('.');
  return parts.length === 4 && parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}
function validIpv6(s) {
  if (!/^[0-9a-f:.]+$/i.test(s) || s.includes(':::')) return false;
  const halves = s.split('::');
  if (halves.length > 2) return false;
  let count = 0;
  for (const half of halves) {
    if (half === '') continue;
    const items = half.split(':');
    for (let i = 0; i < items.length; i++) {
      if (i === items.length - 1 && items[i].includes('.') && half === halves[halves.length - 1]) {
        if (!validIpv4(items[i])) return false;
        count += 2;
      } else if (/^[0-9a-f]{1,4}$/i.test(items[i])) count += 1;
      else return false;
    }
  }
  return halves.length === 2 ? count < 8 : count === 8;
}
function validUri(s) {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s) || /[\s<>"\\^`{|}]/.test(s)) return false;
  try { new URL(s); return true; } catch { return false; }
}

export const FORMATS = {
  'date-time': (s) => { const [d, t, ...rest] = s.split(/t/i); return rest.length === 0 && t !== undefined && validDate(d) && validTime(t); },
  date: validDate,
  time: validTime,
  email: (s) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s) && s.indexOf('@') === s.lastIndexOf('@') && !/^\.|\.\.|\.@/.test(s),
  hostname: (s) => s.length <= 253 && /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/i.test(s),
  ipv4: validIpv4,
  ipv6: validIpv6,
  uri: validUri,
  'uri-reference': (s) => !/[\s<>"\\^`{|}]/.test(s),
  uuid: (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  regex: (s) => { try { new RegExp(s, 'u'); return true; } catch { return false; } },
  'json-pointer': (s) => s === '' || /^(\/([^~/]|~[01])*)+$/.test(s),
  duration: (s) => /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/.test(s),
};

// ---- reference resolution ----------------------------------------------------------------------------------------

function collectTargets(root) {
  const anchors = new Map();
  const ids = new Map();
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!isObject(node)) return;
    if (typeof node.$anchor === 'string') anchors.set(node.$anchor, node);
    if (typeof node.$id === 'string') ids.set(node.$id.replace(/#$/, ''), node);
    for (const v of Object.values(node)) walk(v);
  };
  walk(root);
  return { anchors, ids };
}

function resolveRef(ref, root, targets) {
  if (ref === '#' || ref === '') return root;
  const [base, fragment = ''] = ref.split('#');
  let node = root;
  if (base) {
    node = targets.ids.get(base);
    if (!node) throw new SchemaError(`$ref "${ref}" points outside this schema; only references inside the schema text (such as #/$defs/name) can be followed.`);
  }
  if (fragment === '') return node;
  if (!fragment.startsWith('/')) {
    const anchored = targets.anchors.get(decodeURIComponent(fragment));
    if (!anchored) throw new SchemaError(`$ref "${ref}": there is no $anchor named "${fragment}".`);
    return anchored;
  }
  for (const raw of fragment.slice(1).split('/')) {
    const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, key)) throw new SchemaError(`$ref "${ref}" does not point at anything in the schema (nothing at "${key}").`);
    node = node[key];
  }
  return node;
}

// ---- validation -------------------------------------------------------------------------------------------------

/**
 * Validates `instance` against `schema`.
 * @param {*} instance a parsed JSON value
 * @param {*} schema a parsed JSON Schema (object or boolean)
 * @param {{formats?: boolean, maxErrors?: number}} options formats: treat `format` as a check (default true)
 * @returns {{valid: boolean, errors: {path: string, schemaPath: string, keyword: string, message: string, causes?: string[]}[], warnings: string[], truncated: boolean}}
 */
export function validate(instance, schema, { formats = true, maxErrors = 200 } = {}) {
  if (typeof schema !== 'boolean' && !isObject(schema)) throw new SchemaError('A JSON Schema must be an object (or true / false).');
  const targets = collectTargets(schema);
  const warnings = [];
  const warned = new Set();
  const regexCache = new Map();

  const regex = (source) => {
    let re = regexCache.get(source);
    if (!re) {
      try { re = new RegExp(source, 'u'); } catch (e) { throw new SchemaError(`Invalid regular expression "${source}" in the schema: ${e.message}`); }
      regexCache.set(source, re);
    }
    return re;
  };

  /** Returns the errors for one schema applied to one value (an empty list means it passes). */
  function check(node, value, path, spath, depth) {
    if (depth > MAX_DEPTH) throw new SchemaError('The schema refers to itself without ever consuming any of the data ($ref loop).');
    if (node === true) return [];
    if (node === false) return [{ path: pathText(path), schemaPath: spath, keyword: 'false', message: 'No value is allowed here (the schema is false).' }];
    if (!isObject(node)) throw new SchemaError(`The schema at ${spath || '#'} must be an object or a boolean.`);
    const errors = [];
    const at = pathText(path);
    const fail = (keyword, message, causes) => errors.push({ path: at, schemaPath: `${spath}/${keyword}`, keyword, message, ...(causes ? { causes } : {}) });
    const sub = (keyword, child, childValue, childPath, extra = '') => check(child, childValue, childPath, `${spath}/${keyword}${extra}`, depth + 1);
    for (const k of IGNORED_WITH_WARNING) {
      if (k in node && !warned.has(k)) { warned.add(k); warnings.push(`"${k}" is not supported and was ignored, so values it would reject can pass.`); }
    }

    if (typeof node.$ref === 'string') errors.push(...check(resolveRef(node.$ref, schema, targets), value, path, `${spath}/$ref`, depth + 1));

    if ('type' in node) {
      const types = Array.isArray(node.type) ? node.type : [node.type];
      if (!types.some((t) => typeMatches(value, t))) fail('type', `Expected ${types.join(' or ')} but found ${typeOf(value) === 'number' && !Number.isInteger(value) ? 'a non-integer number' : typeOf(value)}.`);
    }
    if ('enum' in node && Array.isArray(node.enum) && !node.enum.some((e) => deepEqual(e, value))) fail('enum', `Must be one of ${show(node.enum)}; found ${show(value)}.`);
    if ('const' in node && !deepEqual(node.const, value)) fail('const', `Must be exactly ${show(node.const)}; found ${show(value)}.`);

    if (typeof value === 'number') {
      if (typeof node.multipleOf === 'number') {
        const q = value / node.multipleOf;
        if (!(Math.abs(q - Math.round(q)) < 1e-9 * Math.max(1, Math.abs(q)))) fail('multipleOf', `${value} is not a multiple of ${node.multipleOf}.`);
      }
      if (typeof node.maximum === 'number' && value > node.maximum) fail('maximum', `${value} is more than the maximum ${node.maximum}.`);
      if (typeof node.exclusiveMaximum === 'number' && value >= node.exclusiveMaximum) fail('exclusiveMaximum', `${value} must be less than ${node.exclusiveMaximum}.`);
      if (typeof node.minimum === 'number' && value < node.minimum) fail('minimum', `${value} is less than the minimum ${node.minimum}.`);
      if (typeof node.exclusiveMinimum === 'number' && value <= node.exclusiveMinimum) fail('exclusiveMinimum', `${value} must be more than ${node.exclusiveMinimum}.`);
      // draft-04 boolean forms
      if (node.exclusiveMaximum === true && typeof node.maximum === 'number' && value === node.maximum) fail('exclusiveMaximum', `${value} must be less than ${node.maximum}.`);
      if (node.exclusiveMinimum === true && typeof node.minimum === 'number' && value === node.minimum) fail('exclusiveMinimum', `${value} must be more than ${node.minimum}.`);
    }

    if (typeof value === 'string') {
      const n = lengthOf(value);
      if (typeof node.maxLength === 'number' && n > node.maxLength) fail('maxLength', `Text is ${n} characters; at most ${node.maxLength} allowed.`);
      if (typeof node.minLength === 'number' && n < node.minLength) fail('minLength', `Text is ${n} characters; at least ${node.minLength} required.`);
      if (typeof node.pattern === 'string' && !regex(node.pattern).test(value)) fail('pattern', `Text ${show(value)} does not match the pattern ${node.pattern}.`);
      if (formats && typeof node.format === 'string' && FORMATS[node.format] && !FORMATS[node.format](value)) fail('format', `${show(value)} is not a valid ${node.format}.`);
    }

    if (Array.isArray(value)) {
      if (typeof node.maxItems === 'number' && value.length > node.maxItems) fail('maxItems', `Array has ${value.length} items; at most ${node.maxItems} allowed.`);
      if (typeof node.minItems === 'number' && value.length < node.minItems) fail('minItems', `Array has ${value.length} items; at least ${node.minItems} required.`);
      if (node.uniqueItems === true) {
        for (let i = 1; i < value.length; i++) {
          const j = value.slice(0, i).findIndex((x) => deepEqual(x, value[i]));
          if (j >= 0) { fail('uniqueItems', `Items ${j} and ${i} are equal; all items must be different.`); break; }
        }
      }
      const prefix = Array.isArray(node.prefixItems) ? node.prefixItems : Array.isArray(node.items) ? node.items : null;
      const restSchema = Array.isArray(node.items) ? node.additionalItems : node.items;
      if (prefix) value.slice(0, prefix.length).forEach((item, i) => errors.push(...sub(Array.isArray(node.prefixItems) ? 'prefixItems' : 'items', prefix[i], item, [...path, i], `/${i}`)));
      if (restSchema !== undefined && !(Array.isArray(node.items) && node.additionalItems === undefined)) {
        value.slice(prefix ? prefix.length : 0).forEach((item, i) => errors.push(...sub(Array.isArray(node.items) ? 'additionalItems' : 'items', restSchema, item, [...path, (prefix ? prefix.length : 0) + i])));
      }
      if ('contains' in node) {
        const matches = value.filter((item, i) => check(node.contains, item, [...path, i], `${spath}/contains`, depth + 1).length === 0).length;
        const min = typeof node.minContains === 'number' ? node.minContains : 1;
        if (matches < min) fail('contains', matches === 0 ? 'No item matches the "contains" schema.' : `Only ${matches} items match the "contains" schema; at least ${min} required.`);
        if (typeof node.maxContains === 'number' && matches > node.maxContains) fail('maxContains', `${matches} items match the "contains" schema; at most ${node.maxContains} allowed.`);
      }
    }

    if (isObject(value)) {
      const keys = Object.keys(value);
      if (typeof node.maxProperties === 'number' && keys.length > node.maxProperties) fail('maxProperties', `Object has ${keys.length} properties; at most ${node.maxProperties} allowed.`);
      if (typeof node.minProperties === 'number' && keys.length < node.minProperties) fail('minProperties', `Object has ${keys.length} properties; at least ${node.minProperties} required.`);
      if (Array.isArray(node.required)) {
        const missing = node.required.filter((k) => !Object.hasOwn(value, k));
        if (missing.length) fail('required', `Missing required ${missing.length === 1 ? 'property' : 'properties'}: ${missing.join(', ')}.`);
      }
      const dependents = { ...(isObject(node.dependentRequired) ? node.dependentRequired : {}), ...(isObject(node.dependencies) ? Object.fromEntries(Object.entries(node.dependencies).filter(([, v]) => Array.isArray(v))) : {}) };
      for (const [k, needed] of Object.entries(dependents)) {
        if (Object.hasOwn(value, k) && Array.isArray(needed)) {
          const missing = needed.filter((n) => !Object.hasOwn(value, n));
          if (missing.length) fail('dependentRequired', `"${k}" is present, so these must be too: ${missing.join(', ')}.`);
        }
      }
      const depSchemas = { ...(isObject(node.dependentSchemas) ? node.dependentSchemas : {}), ...(isObject(node.dependencies) ? Object.fromEntries(Object.entries(node.dependencies).filter(([, v]) => !Array.isArray(v))) : {}) };
      for (const [k, s] of Object.entries(depSchemas)) if (Object.hasOwn(value, k)) errors.push(...sub('dependentSchemas', s, value, path, `/${k}`));
      if ('propertyNames' in node) for (const k of keys) errors.push(...sub('propertyNames', node.propertyNames, k, path, `/${k}`).map((e) => ({ ...e, message: `Property name ${show(k)}: ${e.message}` })));

      const props = isObject(node.properties) ? node.properties : {};
      const patterns = isObject(node.patternProperties) ? Object.entries(node.patternProperties).map(([p, s]) => [p, regex(p), s]) : [];
      for (const k of keys) {
        let matched = false;
        if (Object.hasOwn(props, k)) { matched = true; errors.push(...sub('properties', props[k], value[k], [...path, k], `/${k}`)); }
        for (const [p, re, s] of patterns) if (re.test(k)) { matched = true; errors.push(...sub('patternProperties', s, value[k], [...path, k], `/${p}`)); }
        if (!matched && node.additionalProperties !== undefined) {
          if (node.additionalProperties === false) errors.push({ path: pathText([...path, k]), schemaPath: `${spath}/additionalProperties`, keyword: 'additionalProperties', message: `Property "${k}" is not allowed here.` });
          else errors.push(...sub('additionalProperties', node.additionalProperties, value[k], [...path, k]));
        }
      }
    }

    if (Array.isArray(node.allOf)) node.allOf.forEach((s, i) => errors.push(...sub('allOf', s, value, path, `/${i}`)));
    if (Array.isArray(node.anyOf)) {
      const results = node.anyOf.map((s, i) => sub('anyOf', s, value, path, `/${i}`));
      if (!results.some((r) => r.length === 0)) fail('anyOf', `Matches none of the ${results.length} allowed schemas.`, results.map((r, i) => `Option ${i + 1}: ${r[0].message} (${r[0].path})`));
    }
    if (Array.isArray(node.oneOf)) {
      const results = node.oneOf.map((s, i) => sub('oneOf', s, value, path, `/${i}`));
      const passing = results.flatMap((r, i) => (r.length === 0 ? [i + 1] : []));
      if (passing.length === 0) fail('oneOf', `Matches none of the ${results.length} allowed schemas; exactly one must match.`, results.map((r, i) => `Option ${i + 1}: ${r[0].message} (${r[0].path})`));
      else if (passing.length > 1) fail('oneOf', `Matches ${passing.length} of the schemas (options ${passing.join(', ')}); exactly one must match.`);
    }
    if ('not' in node && sub('not', node.not, value, path).length === 0) fail('not', 'Matches a schema it must not match.');
    if ('if' in node) {
      const passes = sub('if', node.if, value, path).length === 0;
      if (passes && 'then' in node) errors.push(...sub('then', node.then, value, path));
      if (!passes && 'else' in node) errors.push(...sub('else', node.else, value, path));
    }
    return errors;
  }

  const all = check(schema, instance, [], '#', 0);
  const unique = [];
  const seen = new Set();
  for (const e of all) {
    const id = `${e.path}|${e.schemaPath}|${e.message}`;
    if (!seen.has(id)) { seen.add(id); unique.push(e); }
  }
  return { valid: unique.length === 0, errors: unique.slice(0, maxErrors), warnings, truncated: unique.length > maxErrors };
}
