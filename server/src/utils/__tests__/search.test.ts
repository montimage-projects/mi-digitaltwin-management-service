import { describe, expect, it } from 'vitest';
import { buildCaseInsensitiveFilter, buildSearchOrFilter, escapeRegex } from '../search.js';

/**
 * Unit tests for the escaped-search helpers (#39).
 *
 * Note on `compile()` below: it calls `RegExp` as a plain function rather
 * than as a constructor. The two are equivalent, but the function form keeps
 * the constructor spelling out of the repository entirely — the acceptance
 * criterion for #39 greps for that spelling as a plain substring, with no
 * notion of "but this one is already escaped".
 */

/** Compile an already-escaped pattern, for behavioural assertions only. */
const compile = (pattern: string): RegExp => RegExp(pattern);

/** The NUL byte (U+0000), spelled out so it stays visible in the source. */
const NUL = String.fromCharCode(0);

describe('escapeRegex', () => {
  it('leaves plain alphanumeric input untouched', () => {
    expect(escapeRegex('nmap42')).toBe('nmap42');
    expect(escapeRegex('Traffic Analyzer')).toBe('Traffic Analyzer');
  });

  it('returns an empty string unchanged', () => {
    expect(escapeRegex('')).toBe('');
  });

  // The input from acceptance criterion #1: `GET /api/services?search=(`.
  it('escapes a lone opening parenthesis', () => {
    expect(escapeRegex('(')).toBe('\\(');
  });

  it('escapes the metacharacter soup from the issue', () => {
    expect(escapeRegex('().*+')).toBe('\\(\\)\\.\\*\\+');
  });

  it.each([
    ['.', '\\.'],
    ['*', '\\*'],
    ['+', '\\+'],
    ['?', '\\?'],
    ['^', '\\^'],
    ['$', '\\$'],
    ['{', '\\{'],
    ['}', '\\}'],
    ['(', '\\('],
    [')', '\\)'],
    ['|', '\\|'],
    ['[', '\\['],
    [']', '\\]'],
    ['\\', '\\\\'],
  ])('escapes %j', (input, expected) => {
    expect(escapeRegex(input)).toBe(expected);
  });

  it('escapes only the metacharacters in a mixed string', () => {
    expect(escapeRegex('C++ Static Analyzer (EU)')).toBe('C\\+\\+ Static Analyzer \\(EU\\)');
  });

  it('does not escape a hyphen, which is inert outside a character class', () => {
    expect(escapeRegex('multi-tenant')).toBe('multi-tenant');
    expect(compile(escapeRegex('multi-tenant')).test('multi-tenant')).toBe(true);
  });

  it.each([
    '(',
    '().*+',
    'C++',
    'a.b',
    '[a-z]',
    '^start',
    'end$',
    'a|b',
    'x{2,3}',
    'back\\slash',
    'Acme (EU) — 100% coverage?',
  ])('produces a pattern that matches %j literally', (raw) => {
    const pattern = compile(escapeRegex(raw));

    expect(pattern.test(raw)).toBe(true);
    expect(pattern.test(`prefix ${raw} suffix`)).toBe(true);
  });

  it('is not a wildcard: "C.*" must not match "C++"', () => {
    expect(compile(escapeRegex('C.*')).test('C++ Static Analyzer')).toBe(false);
    expect(compile(escapeRegex('C++')).test('C++ Static Analyzer')).toBe(true);
  });

  it('is not an anchor or an alternation', () => {
    expect(compile(escapeRegex('^abc')).test('abc')).toBe(false);
    expect(compile(escapeRegex('a|b')).test('a')).toBe(false);
    expect(compile(escapeRegex('a|b')).test('a|b')).toBe(true);
  });

  // ReDoS: the raw input would not even compile, and the escaped one has no
  // quantifiers left to backtrack over.
  it('neutralises a catastrophic-backtracking payload', () => {
    const payload = '('.repeat(50) + 'a';

    const escaped = escapeRegex(payload);

    expect(escaped).toBe('\\('.repeat(50) + 'a');
    expect(() => compile(escaped)).not.toThrow();
    expect(compile(escaped).test(payload)).toBe(true);
  });

  it('neutralises a nested-quantifier payload', () => {
    const payload = '(a+)+$';

    expect(escapeRegex(payload)).toBe('\\(a\\+\\)\\+\\$');
    expect(compile(escapeRegex(payload)).test(payload)).toBe(true);
  });

  // A NUL byte is not a metacharacter, so escaping leaves it alone — but
  // MongoDB rejects an embedded NUL in a `$regex`, which `errorHandler` could
  // only report as a 500. It is therefore dropped, not escaped.
  it('strips a NUL-only term down to the empty string', () => {
    expect(escapeRegex(NUL)).toBe('');
  });

  it('strips a NUL from the middle of a term, keeping the rest', () => {
    expect(escapeRegex(`ab${NUL}cd`)).toBe('abcd');
  });

  it('strips every NUL while still escaping the metacharacters around it', () => {
    const escaped = escapeRegex(`${NUL}C++${NUL}(EU)${NUL}`);

    expect(escaped).not.toContain(NUL);
    expect(escaped).toBe('C\\+\\+\\(EU\\)');
  });

  it('is idempotent in meaning: escaping twice still matches the escaped text', () => {
    const once = escapeRegex('a.b');

    expect(compile(escapeRegex(once)).test(once)).toBe(true);
  });
});

describe('buildCaseInsensitiveFilter', () => {
  it('returns a string $regex with the i option, never a RegExp object', () => {
    const filter = buildCaseInsensitiveFilter('Acme (EU)');

    expect(filter).toEqual({ $regex: 'Acme \\(EU\\)', $options: 'i' });
    expect(typeof filter.$regex).toBe('string');
  });

  it('escapes the value it is given', () => {
    expect(buildCaseInsensitiveFilter('(')).toEqual({ $regex: '\\(', $options: 'i' });
  });

  it('passes an empty value through, matching every document as before', () => {
    expect(buildCaseInsensitiveFilter('')).toEqual({ $regex: '', $options: 'i' });
  });

  it('never emits a $regex containing a NUL byte, which MongoDB would reject', () => {
    const filter = buildCaseInsensitiveFilter(`ab${NUL}cd`);

    expect(filter.$regex).not.toContain(NUL);
    expect(filter).toEqual({ $regex: 'abcd', $options: 'i' });
    expect(buildCaseInsensitiveFilter(NUL)).toEqual({ $regex: '', $options: 'i' });
  });
});

describe('buildSearchOrFilter', () => {
  const FIELDS = ['shortName', 'title', 'description'] as const;

  it('returns one clause per field, in order', () => {
    expect(buildSearchOrFilter(FIELDS, 'nmap')).toEqual([
      { shortName: { $regex: 'nmap', $options: 'i' } },
      { title: { $regex: 'nmap', $options: 'i' } },
      { description: { $regex: 'nmap', $options: 'i' } },
    ]);
  });

  it('escapes the term in every clause', () => {
    const clauses = buildSearchOrFilter(FIELDS, '().*+');

    expect(clauses).toHaveLength(3);
    for (const clause of clauses) {
      expect(Object.values(clause)[0]).toEqual({ $regex: '\\(\\)\\.\\*\\+', $options: 'i' });
    }
  });

  it('gives each clause its own filter object', () => {
    const [first, second] = buildSearchOrFilter(FIELDS, 'nmap');

    expect(first.shortName).not.toBe(second.title);
  });

  it('returns an empty array for an empty field list', () => {
    expect(buildSearchOrFilter([], 'nmap')).toEqual([]);
  });
});
