import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, 'index.css'), 'utf8');

type Hsl = [number, number, number];

const CONTRAST_PAIRS: Array<[string, string]> = [
  ['background', 'foreground'],
  ['card', 'card-foreground'],
  ['popover', 'popover-foreground'],
  ['primary', 'primary-foreground'],
  ['secondary', 'secondary-foreground'],
  ['accent', 'accent-foreground'],
];

const THEMES = { light: ':root', dark: '.dark' } as const;

function themeTokens(selector: string): Record<string, Hsl> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no ${selector} block found in index.css`);
  const tokens: Record<string, Hsl> = {};
  for (const m of match[1].matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)) {
    tokens[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return tokens;
}

function hslToSrgb([h, s, l]: Hsl): [number, number, number] {
  const c = (1 - Math.abs(2 * (l / 100) - 1)) * (s / 100);
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l / 100 - c / 2;
  const [r, g, b] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  return [r + m, g + m, b + m];
}

function relativeLuminance(hsl: Hsl): number {
  const [r, g, b] = hslToSrgb(hsl).map((v) =>
    v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: Hsl, b: Hsl): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe.each(Object.entries(THEMES))('index.css %s theme', (_name, selector) => {
  const tokens = themeTokens(selector);

  it.each(CONTRAST_PAIRS)('keeps --%s / --%s contrast at WCAG AA >= 4.5:1', (bg, fg) => {
    expect(tokens[bg], `--${bg} is defined`).toBeDefined();
    expect(tokens[fg], `--${fg} is defined`).toBeDefined();
    expect(contrastRatio(tokens[bg], tokens[fg])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps --muted-foreground readable on --background (WCAG AA >= 4.5:1)', () => {
    expect(tokens.background).toBeDefined();
    expect(tokens['muted-foreground']).toBeDefined();
    expect(contrastRatio(tokens.background, tokens['muted-foreground'])).toBeGreaterThanOrEqual(
      4.5
    );
  });
});

describe('index.css dark variant', () => {
  it('binds the Tailwind dark: variant to the .dark class toggled by theme-store', () => {
    expect(css).toMatch(/@custom-variant\s+dark\s+\(&:where\(\.dark,\s*\.dark \*\)\);/);
  });
});
