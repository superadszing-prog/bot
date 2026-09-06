/**
 * Defense-in-depth helpers against NoSQL operator injection.
 *
 * Mongoose (with strictQuery) already strips unknown operators in filters,
 * but we explicitly coerce untrusted scalar inputs to strings and reject
 * object/array values where a scalar is expected, so a malicious
 * `{ "$ne": null }` can never reach a query as an operator.
 */

/** Coerce to a plain string; returns undefined for objects/arrays. */
function asString(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object') return undefined; // reject {$ne:...} style objects
  return String(value);
}

/** Whitelist-validate a value; returns undefined when not allowed. */
function oneOf(value, allowed) {
  return allowed.includes(value) ? value : undefined;
}

module.exports = { asString, oneOf };
