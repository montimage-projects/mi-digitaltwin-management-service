import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const css = readFileSync(path.resolve(__dirname, 'index.css'), 'utf8');
const tailwindTheme = readFileSync(require.resolve('tailwindcss/theme.css'), 'utf8');
const sourceFiles = {
  topologyEditor: readFileSync(
    path.resolve(__dirname, 'components/topology/TopologyEditor.tsx'),
    'utf8'
  ),
  projectForm: readFileSync(path.resolve(__dirname, 'components/projects/ProjectForm.tsx'), 'utf8'),
  dashboard: readFileSync(path.resolve(__dirname, 'pages/Dashboard.tsx'), 'utf8'),
  badge: readFileSync(path.resolve(__dirname, 'components/ui/badge.tsx'), 'utf8'),
  button: readFileSync(path.resolve(__dirname, 'components/ui/button.tsx'), 'utf8'),
  confirmDialog: readFileSync(path.resolve(__dirname, 'components/ui/confirm-dialog.tsx'), 'utf8'),
  executionConsole: readFileSync(
    path.resolve(__dirname, 'components/execution/ExecutionConsole.tsx'),
    'utf8'
  ),
  scenarioTable: readFileSync(
    path.resolve(__dirname, 'components/scenarios/ScenarioTable.tsx'),
    'utf8'
  ),
  infrastructureTable: readFileSync(
    path.resolve(__dirname, 'components/infrastructure/InfrastructureTable.tsx'),
    'utf8'
  ),
  scenarioDetail: readFileSync(path.resolve(__dirname, 'pages/ScenarioDetail.tsx'), 'utf8'),
  userManagement: readFileSync(path.resolve(__dirname, 'pages/UserManagement.tsx'), 'utf8'),
};

type Hsl = [number, number, number];
type Oklch = [number, number, number];
type Rgb = [number, number, number];

const CONTRAST_PAIRS: Array<[string, string]> = [
  ['background', 'foreground'],
  ['card', 'card-foreground'],
  ['popover', 'popover-foreground'],
  ['primary', 'primary-foreground'],
  ['secondary', 'secondary-foreground'],
  ['accent', 'accent-foreground'],
  ['muted', 'muted-foreground'],
  ['destructive', 'destructive-foreground'],
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

function tailwindOklch(name: string): Oklch {
  const match = tailwindTheme.match(new RegExp(`--color-${name}:\\s*oklch\\(([^)]+)\\)`));
  if (!match) throw new Error(`no Tailwind color ${name} found`);
  const [lightness, chroma, hue] = match[1].trim().split(/\s+/);
  return [Number(lightness.replace('%', '')), Number(chroma), Number(hue)];
}

function oklchToSrgb([lightness, chroma, hue]: Oklch): Rgb {
  const l = lightness / 100;
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const lLinear = Math.pow(l + 0.3963377774 * a + 0.2158037573 * b, 3);
  const mLinear = Math.pow(l - 0.1055613458 * a - 0.0638541728 * b, 3);
  const sLinear = Math.pow(l - 0.0894841775 * a - 1.291485548 * b, 3);
  const toSrgb = (value: number) => {
    const clipped = Math.max(0, Math.min(1, value));
    return clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * Math.pow(clipped, 1 / 2.4) - 0.055;
  };
  return [
    toSrgb(4.0767416621 * lLinear - 3.3077115913 * mLinear + 0.2309699292 * sLinear),
    toSrgb(-1.2684380046 * lLinear + 2.6097574011 * mLinear - 0.3413193965 * sLinear),
    toSrgb(-0.0041960863 * lLinear - 0.7034186147 * mLinear + 1.707614701 * sLinear),
  ];
}

function rgbRelativeLuminance(rgb: Rgb): number {
  const channels = rgb.map((normalized) =>
    normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function rgbContrastRatio(a: Rgb, b: Rgb): number {
  const la = rgbRelativeLuminance(a);
  const lb = rgbRelativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const tailwindColors = {
  yellow400: oklchToSrgb(tailwindOklch('yellow-400')),
  yellow700: oklchToSrgb(tailwindOklch('yellow-700')),
  amber400: oklchToSrgb(tailwindOklch('amber-400')),
  amber700: oklchToSrgb(tailwindOklch('amber-700')),
  green100: oklchToSrgb(tailwindOklch('green-100')),
  green400: oklchToSrgb(tailwindOklch('green-400')),
  green700: oklchToSrgb(tailwindOklch('green-700')),
  green800: oklchToSrgb(tailwindOklch('green-800')),
  red700: oklchToSrgb(tailwindOklch('red-700')),
};

const WHITE: Rgb = [1, 1, 1];
const DARK_BACKGROUND = hslToSrgb([0, 0, 4]);

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

describe('index.css destructive token', () => {
  it('keeps the light destructive background at WCAG AA against white', () => {
    const tokens = themeTokens(':root');
    expect(contrastRatio(tokens.destructive, [0, 0, 100])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('hard-coded status utility palettes', () => {
  it('keeps the unsaved badge readable in both themes', () => {
    expect(sourceFiles.topologyEditor).toContain('text-yellow-700');
    expect(sourceFiles.topologyEditor).toContain('border-yellow-700');
    expect(sourceFiles.topologyEditor).toContain('dark:text-yellow-400');
    expect(sourceFiles.topologyEditor).toContain('dark:border-yellow-400');
    expect(rgbContrastRatio(tailwindColors.yellow700, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(rgbContrastRatio(tailwindColors.yellow400, DARK_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps project warning text readable in both themes', () => {
    expect(sourceFiles.projectForm).toContain('text-amber-700');
    expect(sourceFiles.projectForm).toContain('dark:text-amber-400');
    expect(sourceFiles.projectForm).toContain('data-[disabled]:opacity-100');
    expect(rgbContrastRatio(tailwindColors.amber700, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(rgbContrastRatio(tailwindColors.amber400, DARK_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps dashboard icon and active badge readable in both themes', () => {
    expect(sourceFiles.dashboard).toContain('h-6 w-6 text-green-800');
    expect(sourceFiles.dashboard).toContain('text-green-700 border-green-700');
    expect(sourceFiles.dashboard).toContain('dark:text-green-400');
    expect(sourceFiles.dashboard).toContain('dark:border-green-400');
    expect(
      rgbContrastRatio(tailwindColors.green800, tailwindColors.green100)
    ).toBeGreaterThanOrEqual(4.5);
    expect(rgbContrastRatio(tailwindColors.green700, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(rgbContrastRatio(tailwindColors.green400, DARK_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('destructive control hover palettes', () => {
  it('keeps destructive hover text readable in both themes', () => {
    expect(sourceFiles.badge).toContain('hover:bg-red-700');
    expect(sourceFiles.button).toContain('hover:bg-red-700');
    expect(sourceFiles.badge).not.toContain('hover:bg-destructive/80');
    expect(sourceFiles.button).not.toContain('hover:bg-destructive/90');

    const lightForeground = hslToSrgb(themeTokens(':root')['destructive-foreground']);
    const darkForeground = hslToSrgb(themeTokens('.dark')['destructive-foreground']);
    expect(rgbContrastRatio(tailwindColors.red700, lightForeground)).toBeGreaterThanOrEqual(4.5);
    expect(rgbContrastRatio(tailwindColors.red700, darkForeground)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('direct destructive control hover palettes', () => {
  it('keeps every direct destructive control on an opaque verified hover palette', () => {
    const directDestructiveSources = {
      confirmDialog: sourceFiles.confirmDialog,
      topologyEditor: sourceFiles.topologyEditor,
      executionConsole: sourceFiles.executionConsole,
      scenarioTable: sourceFiles.scenarioTable,
      infrastructureTable: sourceFiles.infrastructureTable,
      scenarioDetail: sourceFiles.scenarioDetail,
      userManagement: sourceFiles.userManagement,
    };

    for (const [file, source] of Object.entries(directDestructiveSources)) {
      expect(source, `${file} must not use translucent destructive hover`).not.toMatch(
        /bg-destructive\s+text-destructive-foreground\s+hover:bg-destructive\/\d+/
      );
      expect(source, `${file} must use the verified opaque destructive hover`).toContain(
        'hover:bg-red-700'
      );
    }
  });
});

describe('index.css dark variant', () => {
  it('binds the Tailwind dark: variant to the .dark class toggled by theme-store', () => {
    expect(css).toMatch(/@custom-variant\s+dark\s+\(&:where\(\.dark,\s*\.dark \*\)\);/);
  });
});
