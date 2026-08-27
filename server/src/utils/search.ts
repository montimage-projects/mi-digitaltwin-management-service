/**
 * Helpers for turning user-supplied search terms into MongoDB filters.
 *
 * Route handlers used to interpolate `req.query` values straight into a
 * regular expression. That had three problems (#39):
 *
 * 1. Any unbalanced metacharacter (`(`, `[`, a trailing `+`, ...) made the
 *    engine throw a plain `SyntaxError`, which `errorHandler` can only
 *    report as a 500 — a user typing `C++` crashed the endpoint.
 * 2. A crafted pattern turned the query into a denial-of-service vector.
 * 3. Metacharacters silently changed the meaning of the search: `C.*`
 *    behaved as a wildcard rather than as the text the user typed.
 *
 * These helpers escape the term first, so it always matches literally, and
 * emit a **string** `$regex` with `$options` rather than a `RegExp` object —
 * MongoDB accepts both, and the string form keeps regex construction out of
 * the codebase entirely.
 */

/**
 * Every character that carries special meaning in a regular expression.
 *
 * `-` is deliberately absent: it is only special inside a character class,
 * and `[` is escaped here, so the escaped output can never open one.
 */
const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

/** Case-insensitive substring filter, in MongoDB's string-`$regex` form. */
export interface CaseInsensitiveFilter {
  $regex: string;
  $options: string;
}

/**
 * Escape every regular-expression metacharacter in `input`, so the result is
 * a pattern that matches `input` verbatim and nothing else.
 *
 * @example
 *   escapeRegex('C++')  // 'C\\+\\+'
 *   escapeRegex('(')    // '\\('
 */
export function escapeRegex(input: string): string {
  return input.replace(REGEX_METACHARACTERS, '\\$&');
}

/**
 * Build a case-insensitive "contains" filter for a single field.
 *
 * @example
 *   query.provider = buildCaseInsensitiveFilter('Acme (EU)');
 *   // { $regex: 'Acme \\(EU\\)', $options: 'i' }
 */
export function buildCaseInsensitiveFilter(value: string): CaseInsensitiveFilter {
  return { $regex: escapeRegex(value), $options: 'i' };
}

/**
 * Build the `$or` array that searches one term across several fields.
 *
 * @example
 *   query.$or = buildSearchOrFilter(['shortName', 'title'], 'nmap');
 *   // [{ shortName: {...} }, { title: {...} }]
 */
export function buildSearchOrFilter(
  fields: readonly string[],
  value: string
): Array<Record<string, CaseInsensitiveFilter>> {
  return fields.map((field) => ({ [field]: buildCaseInsensitiveFilter(value) }));
}
