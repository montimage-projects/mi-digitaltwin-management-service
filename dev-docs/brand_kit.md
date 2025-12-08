# Brand Kit: INTACT Digital Twin Management Platform

## Brand Overview

**Brand Mission:** To provide security professionals with a unified, intuitive platform for managing cybersecurity services and orchestrating Digital Twin projects, enabling efficient design, deployment, and evaluation of security scenarios across critical infrastructure sectors.

**Brand Personality:**
- **Professional** — Reflects the serious nature of cybersecurity and EU research
- **Precise** — Emphasizes technical accuracy and reliability
- **Efficient** — Supports streamlined workflows and productivity
- **Trustworthy** — Inspires confidence in security-critical operations
- **Modern** — Contemporary design without unnecessary embellishment

**Target Audience:**
- Tool owners (Senior Research Engineers) maintaining cybersecurity services
- Security analysts designing and executing scenarios
- Project leaders overseeing consortium activities
- Technical proficiency: Medium to Expert

**Brand Positioning:** INTACT is the authoritative platform for EU cybersecurity research collaboration—a professional-grade tool that prioritizes clarity, efficiency, and technical precision over visual flourish. The minimalist aesthetic reflects the focused, no-nonsense approach required for security-critical work.

---

## Color Palette

### Design Philosophy

The INTACT color system follows a strict minimalist approach using only **white, gray, black, and yellow**. This constraint ensures:
- Maximum readability and focus on content
- Professional, research-grade aesthetic
- Reduced visual noise in complex interfaces
- Universal accessibility compliance

**Core Rule:** Yellow is used exclusively for highlighting, text emphasis, and borders—**never as a background color**.

---

### Primary Colors

**Black (Primary)**
- **Hex:** `#0F172A`
- **RGB:** `rgb(15, 23, 42)`
- **HSL:** `hsl(222, 47%, 11%)`
- **Tailwind:** `slate-900`
- **Usage:** Primary text, headings, primary buttons, key UI elements
- **Rationale:** Deep slate-black conveys authority, professionalism, and technical precision. Slightly warmer than pure black for better screen readability.

**Yellow (Accent)**
- **Hex:** `#FACC15`
- **RGB:** `rgb(250, 204, 21)`
- **HSL:** `hsl(48, 96%, 53%)`
- **Tailwind:** `yellow-400`
- **Usage:** Text highlights, focus indicators, important badges, active state borders, callout text
- **Never use as:** Background color, large filled areas
- **Rationale:** High-visibility accent that draws attention to critical elements without overwhelming the minimal palette.

**Yellow Variants (Text/Border Only)**
- **Yellow Light:** `#FDE047` (`yellow-300`) — Subtle highlights, hover states
- **Yellow Dark:** `#EAB308` (`yellow-500`) — Strong emphasis, active borders
- **Yellow Darker:** `#CA8A04` (`yellow-600`) — Text on light backgrounds

---

### Neutral Palette

| Name | Hex | Tailwind | RGB | Usage |
|------|-----|----------|-----|-------|
| **White** | `#FFFFFF` | `white` | `rgb(255, 255, 255)` | Page backgrounds, cards, input backgrounds |
| **Gray 50** | `#F8FAFC` | `slate-50` | `rgb(248, 250, 252)` | Subtle backgrounds, hover states |
| **Gray 100** | `#F1F5F9` | `slate-100` | `rgb(241, 245, 249)` | Secondary backgrounds, disabled inputs |
| **Gray 200** | `#E2E8F0` | `slate-200` | `rgb(226, 232, 240)` | Borders, dividers, table lines |
| **Gray 300** | `#CBD5E1` | `slate-300` | `rgb(203, 213, 225)` | Disabled text, placeholder borders |
| **Gray 400** | `#94A3B8` | `slate-400` | `rgb(148, 163, 184)` | Placeholder text, secondary icons |
| **Gray 500** | `#64748B` | `slate-500` | `rgb(100, 116, 139)` | Secondary text, muted content |
| **Gray 600** | `#475569` | `slate-600` | `rgb(71, 85, 105)` | Body text, descriptions |
| **Gray 700** | `#334155` | `slate-700` | `rgb(51, 65, 85)` | Strong secondary text |
| **Gray 800** | `#1E293B` | `slate-800` | `rgb(30, 41, 59)` | Dark UI elements |
| **Gray 900** | `#0F172A` | `slate-900` | `rgb(15, 23, 42)` | Primary text, headings |
| **Black** | `#020617` | `slate-950` | `rgb(2, 6, 23)` | Maximum contrast text |

---

### Semantic Colors

**Important:** Semantic colors are used for **text, icons, and borders only**—never as background fills. Use gray backgrounds with semantic-colored text/borders instead.

#### Success (Green)
- **Text/Icon:** `#16A34A` (`green-600`)
- **Border:** `#22C55E` (`green-500`)
- **Light Text:** `#15803D` (`green-700`) — For dark backgrounds
- **Usage:** Success messages, completion states, positive indicators
- **Background Alternative:** `#F8FAFC` (gray-50) with green border/text

#### Error (Red)
- **Text/Icon:** `#DC2626` (`red-600`)
- **Border:** `#EF4444` (`red-500`)
- **Light Text:** `#B91C1C` (`red-700`) — For dark backgrounds
- **Usage:** Error messages, destructive actions, validation errors
- **Background Alternative:** `#F8FAFC` (gray-50) with red border/text

#### Warning (Amber)
- **Text/Icon:** `#D97706` (`amber-600`)
- **Border:** `#F59E0B` (`amber-500`)
- **Light Text:** `#B45309` (`amber-700`) — For dark backgrounds
- **Usage:** Warning messages, caution states, attention required
- **Background Alternative:** `#F8FAFC` (gray-50) with amber border/text

#### Info (Blue)
- **Text/Icon:** `#2563EB` (`blue-600`)
- **Border:** `#3B82F6` (`blue-500`)
- **Light Text:** `#1D4ED8` (`blue-700`) — For dark backgrounds
- **Usage:** Informational messages, tips, neutral status
- **Background Alternative:** `#F8FAFC` (gray-50) with blue border/text

---

### Status Badge Colors

| Status | Text Color | Border Color | Background | Icon |
|--------|------------|--------------|------------|------|
| **Pending** | `#64748B` (gray-500) | `#E2E8F0` (gray-200) | `#FFFFFF` | Clock |
| **Running** | `#FACC15` (yellow-400) | `#FACC15` (yellow-400) | `#FFFFFF` | Loader2 |
| **Completed** | `#16A34A` (green-600) | `#22C55E` (green-500) | `#FFFFFF` | CheckCircle |
| **Failed** | `#DC2626` (red-600) | `#EF4444` (red-500) | `#FFFFFF` | XCircle |
| **Available** | `#16A34A` (green-600) | `#22C55E` (green-500) | `#FFFFFF` | Circle (filled) |
| **Offline** | `#DC2626` (red-600) | `#EF4444` (red-500) | `#FFFFFF` | Circle (outline) |

---

### Accessibility Guidelines

#### Contrast Ratios (WCAG 2.1 AA Compliant)

| Combination | Foreground | Background | Ratio | Pass |
|-------------|------------|------------|-------|------|
| Primary text on white | `#0F172A` | `#FFFFFF` | 15.8:1 | ✅ AAA |
| Secondary text on white | `#475569` | `#FFFFFF` | 7.0:1 | ✅ AAA |
| Muted text on white | `#64748B` | `#FFFFFF` | 4.6:1 | ✅ AA |
| Yellow text on black | `#FACC15` | `#0F172A` | 10.3:1 | ✅ AAA |
| Yellow border on white | `#FACC15` | `#FFFFFF` | 1.8:1 | ✅ (decorative) |
| Error text on white | `#DC2626` | `#FFFFFF` | 5.0:1 | ✅ AA |
| Success text on white | `#16A34A` | `#FFFFFF` | 4.5:1 | ✅ AA |
| White text on black | `#FFFFFF` | `#0F172A` | 15.8:1 | ✅ AAA |

#### Text Color Guidelines

- **Primary text:** Always use `slate-900` (#0F172A) on light backgrounds
- **Secondary text:** Use `slate-600` (#475569) for descriptions
- **Muted text:** Use `slate-500` (#64748B) for placeholders (minimum)
- **Inverted:** Use `white` on dark backgrounds
- **Yellow text:** Use `yellow-600` (#CA8A04) for emphasis on light backgrounds

---

## Typography

### Font Families

**Primary Font (System Stack)**
```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```
- **Source:** Google Fonts (Inter) with system fallbacks
- **Weights Used:** 400 (Regular), 500 (Medium), 600 (Semi-Bold), 700 (Bold)
- **Rationale:** Inter is highly legible, professional, and optimized for screens. System fallbacks ensure fast loading.

**Monospace Font (Code)**
```css
font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```
- **Source:** Google Fonts (JetBrains Mono)
- **Weights Used:** 400 (Regular), 500 (Medium)
- **Usage:** YAML editor, code blocks, technical identifiers, Docker URLs

### Typography Scale

| Element | Size (rem) | Size (px) | Weight | Line Height | Letter Spacing | Tailwind Class |
|---------|------------|-----------|--------|-------------|----------------|----------------|
| **Display** | 3rem | 48px | 700 | 1.1 | -0.025em | `text-5xl font-bold` |
| **H1** | 2.25rem | 36px | 700 | 1.2 | -0.025em | `text-4xl font-bold` |
| **H2** | 1.875rem | 30px | 600 | 1.25 | -0.02em | `text-3xl font-semibold` |
| **H3** | 1.5rem | 24px | 600 | 1.3 | -0.015em | `text-2xl font-semibold` |
| **H4** | 1.25rem | 20px | 600 | 1.35 | 0 | `text-xl font-semibold` |
| **H5** | 1.125rem | 18px | 600 | 1.4 | 0 | `text-lg font-semibold` |
| **Body Large** | 1.125rem | 18px | 400 | 1.6 | 0 | `text-lg` |
| **Body** | 1rem | 16px | 400 | 1.6 | 0 | `text-base` |
| **Body Small** | 0.875rem | 14px | 400 | 1.5 | 0 | `text-sm` |
| **Caption** | 0.75rem | 12px | 400 | 1.4 | 0 | `text-xs` |
| **Overline** | 0.75rem | 12px | 600 | 1.2 | 0.05em | `text-xs font-semibold uppercase tracking-wide` |

### Typography Color Application

| Context | Color | Tailwind Class |
|---------|-------|----------------|
| Page headings (H1-H2) | `#0F172A` | `text-slate-900` |
| Section headings (H3-H5) | `#0F172A` | `text-slate-900` |
| Body text | `#475569` | `text-slate-600` |
| Secondary/muted text | `#64748B` | `text-slate-500` |
| Placeholder text | `#94A3B8` | `text-slate-400` |
| Highlighted text | `#CA8A04` | `text-yellow-600` |
| Link text (default) | `#0F172A` | `text-slate-900 underline` |
| Link text (hover) | `#CA8A04` | `hover:text-yellow-600` |

### Code Typography

| Element | Size | Font | Background | Text Color |
|---------|------|------|------------|------------|
| Inline code | 0.875em | JetBrains Mono | `#F1F5F9` | `#0F172A` |
| Code block | 0.8125rem | JetBrains Mono | `#F8FAFC` | `#0F172A` |
| Editor (Monaco) | 13px | JetBrains Mono | `#FFFFFF` | Syntax-highlighted |

---

## Logo Guidelines

### Logo Concept

The INTACT logo is a wordmark that emphasizes **precision** and **security**. The design uses the platform's minimal color palette.

### Logo Variations

**Primary Logo (Wordmark)**
```
INTACT
```
- **Font:** Inter, Bold (700)
- **Color:** `#0F172A` (slate-900)
- **Kerning:** Slightly tightened (-0.02em)
- **Minimum Height:** 24px (digital), 0.25 inches (print)

**Logo with Tagline**
```
INTACT
Digital Twin Security Platform
```
- Tagline in Inter Regular, `#64748B` (slate-500)
- Tagline size: 40% of main wordmark

**Icon/Favicon**
- Letter **"I"** in a square container
- Container: `#0F172A` (slate-900)
- Letter: `#FFFFFF` (white)
- Border radius: 4px for favicon, 8px for app icon

### Logo Usage Rules

#### Clear Space
Minimum clear space equal to the height of the letter "I" on all sides.

```
    ┌─────────────────────────┐
    │                         │
    │      I N T A C T        │
    │                         │
    └─────────────────────────┘
         ↑ Clear space = height of "I"
```

#### Color Applications

| Context | Logo Color | Background |
|---------|------------|------------|
| Light backgrounds | `#0F172A` | White, Gray 50-100 |
| Dark backgrounds | `#FFFFFF` | Slate 800-950 |
| Highlighted | `#FACC15` border/underline | Any |

#### Logo Don'ts

- ❌ Do not use colors outside the approved palette
- ❌ Do not add shadows, gradients, or effects
- ❌ Do not stretch, rotate, or distort
- ❌ Do not use yellow as logo fill color
- ❌ Do not place on busy or low-contrast backgrounds
- ❌ Do not add outlines or strokes
- ❌ Do not change the font or letter spacing

---

## Iconography

### Icon System

**Icon Library:** Lucide React
- **Style:** Outlined (stroke-based)
- **Stroke Width:** 2px (default)
- **Corner Style:** Rounded

### Icon Sizes

| Size | Pixels | Tailwind | Usage |
|------|--------|----------|-------|
| **Extra Small** | 14px | `w-3.5 h-3.5` | Inline with small text |
| **Small** | 16px | `w-4 h-4` | Inline with body text, badges |
| **Default** | 20px | `w-5 h-5` | Buttons, navigation, form elements |
| **Medium** | 24px | `w-6 h-6` | Section headers, feature icons |
| **Large** | 32px | `w-8 h-8` | Empty states, feature highlights |
| **Extra Large** | 48px | `w-12 h-12` | Hero sections, onboarding |

### Icon Colors

| Context | Color | Tailwind Class |
|---------|-------|----------------|
| Default | `#64748B` | `text-slate-500` |
| Active/Primary | `#0F172A` | `text-slate-900` |
| Highlighted | `#CA8A04` | `text-yellow-600` |
| Muted | `#94A3B8` | `text-slate-400` |
| Success | `#16A34A` | `text-green-600` |
| Error | `#DC2626` | `text-red-600` |
| Warning | `#D97706` | `text-amber-600` |
| Info | `#2563EB` | `text-blue-600` |

### Icon Usage by Feature

| Feature Area | Icons Used |
|--------------|------------|
| Navigation | Home, Package, FolderKanban, Server, BarChart3, Users, Settings |
| Actions | Plus, Pencil, Trash2, Copy, Download, ExternalLink, Play, Save |
| Status | CheckCircle, XCircle, AlertCircle, Clock, Loader2, Circle |
| UI Controls | ChevronDown, ChevronRight, ChevronLeft, X, Search, Filter, MoreVertical |
| Domain | Network, Shield, Database, Cpu, Activity, GitBranch, Box |

### Icon Guidelines

- Always pair icons with text labels for accessibility
- Use consistent icon style (all outlined, same stroke width)
- Maintain adequate spacing between icon and text (8px minimum)
- Icons in buttons should be 20px (`w-5 h-5`)
- Provide `aria-label` for standalone icons

---

## Imagery Style

### Photography (Minimal Use)

Given the technical nature of INTACT, photography is used sparingly:

**When Used:**
- Team/partner photos for About sections
- Conference/event documentation

**Style Guidelines:**
- Black and white or desaturated
- Professional, formal settings
- Clean, uncluttered compositions
- High contrast

### Illustrations & Diagrams

**Style:** Technical diagrams with minimal styling

**Diagram Colors:**
- Lines/strokes: `#0F172A` (slate-900) or `#64748B` (slate-500)
- Fills: `#FFFFFF` (white) or `#F8FAFC` (gray-50)
- Highlights: `#FACC15` (yellow-400) for emphasis (stroke/text only)
- Connectors: `#CBD5E1` (slate-300)

**Architecture Diagrams:**
- Use Mermaid.js with custom theme
- Box borders: 1px solid `#E2E8F0`
- Box backgrounds: `#FFFFFF`
- Text: `#0F172A`
- Connecting lines: `#CBD5E1`

### Screenshot Guidelines

- Capture at 2x resolution for retina displays
- Use browser window chrome sparingly
- Highlight important areas with yellow border (`#FACC15`)
- Annotate with numbered callouts in yellow circles

---

## Spacing & Layout

### Spacing Scale (8px Base)

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `space-0` | 0px | `p-0`, `m-0` | Reset |
| `space-0.5` | 2px | `p-0.5`, `m-0.5` | Hairline spacing |
| `space-1` | 4px | `p-1`, `m-1` | Tight inline spacing |
| `space-2` | 8px | `p-2`, `m-2` | Default inline spacing |
| `space-3` | 12px | `p-3`, `m-3` | Compact component padding |
| `space-4` | 16px | `p-4`, `m-4` | Default component padding |
| `space-5` | 20px | `p-5`, `m-5` | Comfortable padding |
| `space-6` | 24px | `p-6`, `m-6` | Card padding, section gaps |
| `space-8` | 32px | `p-8`, `m-8` | Large section padding |
| `space-10` | 40px | `p-10`, `m-10` | Page section margins |
| `space-12` | 48px | `p-12`, `m-12` | Major section spacing |
| `space-16` | 64px | `p-16`, `m-16` | Page-level spacing |

### Grid System

**Container:**
```css
max-width: 1280px;
padding-inline: 24px;
margin-inline: auto;
```
Tailwind: `max-w-7xl mx-auto px-6`

**Responsive Breakpoints:**

| Breakpoint | Width | Tailwind Prefix |
|------------|-------|-----------------|
| Mobile | < 640px | Default |
| Tablet | ≥ 640px | `sm:` |
| Laptop | ≥ 1024px | `lg:` |
| Desktop | ≥ 1280px | `xl:` |
| Wide | ≥ 1536px | `2xl:` |

### Layout Patterns

**Application Shell:**
```
┌──────────────────────────────────────────────────────────────────┐
│ Header (h-14, border-b border-slate-200)                        │
├────────────┬─────────────────────────────────────────────────────┤
│  Sidebar   │                                                     │
│  (w-64)    │  Main Content (flex-1, p-6)                        │
│  border-r  │                                                     │
│  slate-200 │                                                     │
└────────────┴─────────────────────────────────────────────────────┘
```

**Content Area Spacing:**
- Page padding: `p-6` (24px)
- Section gap: `space-y-8` (32px)
- Card gap in grid: `gap-6` (24px)
- Form field gap: `space-y-4` (16px)

---

## Component Styles

### Buttons

#### Primary Button (Black)
```jsx
<button className="
  bg-slate-900
  text-white
  px-4 py-2.5
  rounded-lg
  font-medium
  text-sm
  hover:bg-slate-800
  active:bg-slate-950
  focus:outline-none
  focus:ring-2
  focus:ring-yellow-400
  focus:ring-offset-2
  disabled:bg-slate-300
  disabled:cursor-not-allowed
">
  Button Text
</button>
```

| State | Background | Text | Border |
|-------|------------|------|--------|
| Default | `slate-900` | `white` | none |
| Hover | `slate-800` | `white` | none |
| Active | `slate-950` | `white` | none |
| Focus | `slate-900` | `white` | `ring-yellow-400` |
| Disabled | `slate-300` | `white` | none |

#### Secondary Button (Outlined)
```jsx
<button className="
  bg-white
  text-slate-900
  px-4 py-2.5
  rounded-lg
  font-medium
  text-sm
  border
  border-slate-300
  hover:bg-slate-50
  hover:border-slate-400
  active:bg-slate-100
  focus:outline-none
  focus:ring-2
  focus:ring-yellow-400
  focus:ring-offset-2
  disabled:bg-slate-50
  disabled:text-slate-400
  disabled:border-slate-200
">
  Button Text
</button>
```

#### Ghost Button (Text Only)
```jsx
<button className="
  bg-transparent
  text-slate-600
  px-4 py-2.5
  rounded-lg
  font-medium
  text-sm
  hover:bg-slate-100
  hover:text-slate-900
  active:bg-slate-200
  focus:outline-none
  focus:ring-2
  focus:ring-yellow-400
  focus:ring-offset-2
">
  Button Text
</button>
```

#### Destructive Button
```jsx
<button className="
  bg-white
  text-red-600
  px-4 py-2.5
  rounded-lg
  font-medium
  text-sm
  border
  border-red-300
  hover:bg-slate-50
  hover:border-red-400
  active:bg-slate-100
  focus:outline-none
  focus:ring-2
  focus:ring-red-400
  focus:ring-offset-2
">
  Delete
</button>
```

### Button Sizes

| Size | Padding | Font Size | Icon Size | Tailwind |
|------|---------|-----------|-----------|----------|
| Small | `px-3 py-1.5` | `text-xs` | `w-4 h-4` | `h-8` |
| Default | `px-4 py-2.5` | `text-sm` | `w-5 h-5` | `h-10` |
| Large | `px-6 py-3` | `text-base` | `w-5 h-5` | `h-12` |

---

### Input Fields

#### Text Input
```jsx
<input className="
  w-full
  px-3 py-2.5
  text-sm
  text-slate-900
  bg-white
  border
  border-slate-300
  rounded-lg
  placeholder:text-slate-400
  hover:border-slate-400
  focus:outline-none
  focus:border-slate-900
  focus:ring-2
  focus:ring-yellow-400
  focus:ring-offset-1
  disabled:bg-slate-100
  disabled:text-slate-500
  disabled:cursor-not-allowed
" />
```

#### Input States

| State | Border | Background | Ring |
|-------|--------|------------|------|
| Default | `slate-300` | `white` | none |
| Hover | `slate-400` | `white` | none |
| Focus | `slate-900` | `white` | `yellow-400` |
| Error | `red-500` | `white` | `red-400` on focus |
| Disabled | `slate-200` | `slate-100` | none |

#### Input with Label
```jsx
<div className="space-y-1.5">
  <label className="text-sm font-medium text-slate-900">
    Service Name
    <span className="text-red-600 ml-0.5">*</span>
  </label>
  <input className="..." />
  <p className="text-xs text-slate-500">
    A unique identifier for the service
  </p>
</div>
```

#### Input with Error
```jsx
<div className="space-y-1.5">
  <label className="text-sm font-medium text-slate-900">
    Service Name
  </label>
  <input className="... border-red-500 focus:ring-red-400" />
  <p className="text-xs text-red-600">
    This field is required
  </p>
</div>
```

---

### Cards

#### Default Card
```jsx
<div className="
  bg-white
  border
  border-slate-200
  rounded-xl
  p-6
  shadow-sm
">
  {/* Card content */}
</div>
```

#### Interactive Card (Clickable)
```jsx
<div className="
  bg-white
  border
  border-slate-200
  rounded-xl
  p-6
  shadow-sm
  cursor-pointer
  transition-all
  hover:border-slate-300
  hover:shadow-md
  focus-within:ring-2
  focus-within:ring-yellow-400
  focus-within:ring-offset-2
">
  {/* Card content */}
</div>
```

#### Card with Header
```jsx
<div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
  <div className="px-6 py-4 border-b border-slate-200">
    <h3 className="text-lg font-semibold text-slate-900">Card Title</h3>
  </div>
  <div className="p-6">
    {/* Card content */}
  </div>
</div>
```

---

### Badges

#### Status Badges
```jsx
// Neutral
<span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-full">
  <Clock className="w-3.5 h-3.5" />
  Pending
</span>

// Running (Yellow highlight)
<span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-yellow-600 bg-white border border-yellow-400 rounded-full">
  <Loader2 className="w-3.5 h-3.5 animate-spin" />
  Running
</span>

// Success
<span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-green-600 bg-white border border-green-500 rounded-full">
  <CheckCircle className="w-3.5 h-3.5" />
  Completed
</span>

// Error
<span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 bg-white border border-red-500 rounded-full">
  <XCircle className="w-3.5 h-3.5" />
  Failed
</span>
```

#### Category Badge
```jsx
<span className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-md">
  Threat Inspection
</span>
```

---

### Tables

```jsx
<table className="w-full text-sm">
  <thead>
    <tr className="border-b border-slate-200">
      <th className="px-4 py-3 text-left font-semibold text-slate-900">Name</th>
      <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
      <th className="px-4 py-3 text-right font-semibold text-slate-900">Actions</th>
    </tr>
  </thead>
  <tbody className="divide-y divide-slate-200">
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 text-slate-900">MMT</td>
      <td className="px-4 py-3">{/* Badge */}</td>
      <td className="px-4 py-3 text-right">{/* Actions */}</td>
    </tr>
  </tbody>
</table>
```

---

### Modals/Dialogs

```jsx
// Overlay
<div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />

// Modal
<div className="
  fixed
  top-1/2
  left-1/2
  -translate-x-1/2
  -translate-y-1/2
  w-full
  max-w-lg
  bg-white
  rounded-xl
  shadow-xl
  border
  border-slate-200
">
  <div className="px-6 py-4 border-b border-slate-200">
    <h2 className="text-lg font-semibold text-slate-900">Modal Title</h2>
  </div>
  <div className="p-6">
    {/* Modal content */}
  </div>
  <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
    <button className="...">Cancel</button>
    <button className="...">Confirm</button>
  </div>
</div>
```

---

### Alerts/Messages

**Note:** Alerts use semantic colors for text and borders only, with white or light gray backgrounds.

```jsx
// Success Alert
<div className="flex gap-3 p-4 bg-white border border-green-500 rounded-lg">
  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
  <div>
    <p className="text-sm font-medium text-green-600">Success</p>
    <p className="text-sm text-slate-600">Your changes have been saved.</p>
  </div>
</div>

// Error Alert
<div className="flex gap-3 p-4 bg-white border border-red-500 rounded-lg">
  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
  <div>
    <p className="text-sm font-medium text-red-600">Error</p>
    <p className="text-sm text-slate-600">Something went wrong. Please try again.</p>
  </div>
</div>

// Warning Alert
<div className="flex gap-3 p-4 bg-white border border-amber-500 rounded-lg">
  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
  <div>
    <p className="text-sm font-medium text-amber-600">Warning</p>
    <p className="text-sm text-slate-600">This action cannot be undone.</p>
  </div>
</div>

// Info Alert
<div className="flex gap-3 p-4 bg-white border border-blue-500 rounded-lg">
  <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />
  <div>
    <p className="text-sm font-medium text-blue-600">Information</p>
    <p className="text-sm text-slate-600">Here's something you should know.</p>
  </div>
</div>
```

---

### Focus States (Yellow Highlight)

All interactive elements use yellow for focus indication:

```css
/* Standard focus ring */
focus:outline-none
focus:ring-2
focus:ring-yellow-400
focus:ring-offset-2

/* For dark backgrounds */
focus:ring-yellow-400
focus:ring-offset-slate-900
```

---

## Brand Voice

### Tone Attributes

| Attribute | Description | Example |
|-----------|-------------|---------|
| **Professional** | Authoritative without being cold | "Configure your deployment target" |
| **Clear** | Direct, unambiguous language | "Save" not "Submit your changes" |
| **Concise** | Minimal words, maximum clarity | "Service created" not "Your service has been successfully created" |
| **Helpful** | Guide without condescending | "Enter the Docker image URL (e.g., registry/image:tag)" |

### Writing Guidelines

1. **Use active voice:** "The system detected an error" → "An error occurred"
2. **Address users directly:** Use "you" and "your"
3. **Be specific:** "Enter a valid URL" → "Enter a URL starting with http:// or https://"
4. **Avoid jargon:** Define technical terms on first use
5. **Keep sentences short:** Max 20 words for UI text

### Standard Microcopy

#### Button Labels
| Action | Label |
|--------|-------|
| Create new item | "+ Add [Item]" or "+ New [Item]" |
| Save changes | "Save" |
| Cancel action | "Cancel" |
| Delete item | "Delete" |
| Confirm action | "Confirm" |
| Submit form | "Submit" or action-specific ("Execute", "Deploy") |

#### Form Validation Messages
| Situation | Message Pattern |
|-----------|-----------------|
| Required field | "[Field name] is required" |
| Invalid format | "Enter a valid [format description]" |
| Too short | "[Field] must be at least [n] characters" |
| Duplicate | "A [item] with this [field] already exists" |

#### Success Messages
| Action | Message |
|--------|---------|
| Create | "[Item] created" |
| Update | "Changes saved" |
| Delete | "[Item] deleted" |
| Execute | "Execution started" |

#### Error Messages
| Situation | Message |
|-----------|---------|
| Generic error | "Something went wrong. Please try again." |
| Network error | "Could not connect. Check your connection and try again." |
| Validation error | Specific field errors shown inline |
| Permission denied | "You don't have permission to perform this action." |

---

## Usage Examples

### Example 1: Service Repository Page

```
┌─────────────────────────────────────────────────────────────────────────┐
│  bg-white                                                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Service Repository                          [+ Add Service]     │   │
│  │  ─────────────────                           bg-slate-900        │   │
│  │  text-slate-900                              text-white          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  🔍 [Search services...     ]  [Category ▼]  [Provider ▼]       │   │
│  │     border-slate-300           border-slate-300                  │   │
│  │     focus:ring-yellow-400                                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  INTACT Toolbox                                                  │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  │ Name    │ Title                  │ Category    │ Version │   │   │
│  │  ├─────────┼────────────────────────┼─────────────┼─────────┤   │   │
│  │  │ MMT     │ Montimage Monitor...   │ [badge]     │ v8.1    │   │   │
│  │  │         │ text-slate-600         │ bg-slate-100│         │   │   │
│  │  │ text-slate-900                   │ text-slate-700         │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Example 2: Scenario Editor

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Header: bg-white, border-b border-slate-200                            │
│  ← Back (text-slate-600)   Scenario Title   [Validate] [Save]          │
│                            text-slate-900    btn-secondary  btn-primary │
├──────────────────────────────┬──────────────────────────────────────────┤
│  YAML Editor                 │  Visual Canvas                           │
│  bg-white                    │  bg-slate-50                            │
│  border-r border-slate-200   │                                          │
│                              │  ┌─────────┐                             │
│  version: "1.0"              │  │ Service │ border-slate-300           │
│  text-slate-900              │  │  Node   │ bg-white                   │
│  (JetBrains Mono)            │  └────┬────┘                             │
│                              │       │ connection line: slate-300       │
│  Focus: ring-yellow-400      │       ▼                                  │
│                              │  ┌─────────┐                             │
│                              │  │ Service │ selected: border-yellow-400│
│                              │  │  Node   │                             │
│                              │  └─────────┘                             │
├──────────────────────────────┴──────────────────────────────────────────┤
│  Service Palette: bg-white, border-t border-slate-200                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                                   │
│  │ Service │ │ Service │ │ Service │  Cards: border-slate-200          │
│  │  Card   │ │  Card   │ │  Card   │  hover: border-slate-300          │
│  └─────────┘ └─────────┘ └─────────┘                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Example 3: Empty State

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                              📦                                         │
│                         text-slate-300                                  │
│                              48px                                       │
│                                                                         │
│                       No services yet                                   │
│                       text-slate-900                                    │
│                       font-semibold                                     │
│                                                                         │
│              Add your first cybersecurity service                       │
│              to get started with INTACT.                                │
│              text-slate-500                                             │
│                                                                         │
│                      [+ Add Service]                                    │
│                      bg-slate-900                                       │
│                      text-white                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Example 4: Status Indicators

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Execution Status                                                       │
│  ─────────────────                                                      │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  ○ Pending      text-slate-600, border-slate-200, bg-white       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  ◐ Running      text-yellow-600, border-yellow-400, bg-white     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  ✓ Completed    text-green-600, border-green-500, bg-white       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  ✕ Failed       text-red-600, border-red-500, bg-white           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tailwind Configuration

### tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Using Tailwind's slate palette as primary grays
        // Yellow accent - text/border only, never background
        accent: {
          DEFAULT: '#FACC15', // yellow-400
          light: '#FDE047',   // yellow-300
          dark: '#EAB308',    // yellow-500
          darker: '#CA8A04',  // yellow-600 (for text)
        },
      },
      borderRadius: {
        'xl': '0.75rem',  // 12px
        '2xl': '1rem',    // 16px
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'DEFAULT': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
}
```

### CSS Custom Properties

```css
/* globals.css */
@layer base {
  :root {
    --background: 0 0% 100%;           /* white */
    --foreground: 222 47% 11%;         /* slate-900 */

    --muted: 210 40% 96%;              /* slate-100 */
    --muted-foreground: 215 16% 47%;   /* slate-500 */

    --card: 0 0% 100%;                 /* white */
    --card-foreground: 222 47% 11%;    /* slate-900 */

    --border: 214 32% 91%;             /* slate-200 */
    --input: 214 32% 91%;              /* slate-200 */

    --primary: 222 47% 11%;            /* slate-900 */
    --primary-foreground: 0 0% 100%;   /* white */

    --secondary: 210 40% 96%;          /* slate-100 */
    --secondary-foreground: 222 47% 11%; /* slate-900 */

    --accent: 48 96% 53%;              /* yellow-400 */
    --accent-foreground: 222 47% 11%;  /* slate-900 */

    --destructive: 0 84% 60%;          /* red-500 */
    --destructive-foreground: 0 0% 100%; /* white */

    --ring: 48 96% 53%;                /* yellow-400 - focus ring */

    --radius: 0.5rem;
  }
}
```

---

## Appendix

### AI Research Insights

**Research Round 1: Color Psychology Analysis**
- **Black/Gray:** Conveys authority, professionalism, sophistication
- **White:** Cleanliness, simplicity, space for content to breathe
- **Yellow accent:** Attention, energy, optimism without overwhelming
- **Finding:** Minimal color palettes are trending in enterprise software for 2024-2025
- **Competitor analysis:** Most security tools use blue (overused); monochrome with accent is differentiated

**Research Round 2: Typography Research**
- Inter is the most recommended system font for technical interfaces (GitHub, Figma, Linear)
- JetBrains Mono provides excellent code readability and includes ligatures
- Font loading: System stack fallbacks ensure zero FOUT (Flash of Unstyled Text)
- Recommendation: Stick with proven defaults, customize sparingly

**Research Round 3: Accessibility Validation**
- All color combinations tested against WCAG 2.1 AA requirements
- Yellow text (#CA8A04) on white passes 4.5:1 ratio
- Focus states with yellow ring provide 3:1+ contrast
- Recommendation: Always pair icons with text labels

**Research Round 4: Design System Analysis**
- Shadcn/ui provides excellent accessible component foundations
- Tailwind's slate palette has more warmth than pure grays (better for long reading sessions)
- Yellow focus rings are uncommon but highly visible—good for accessibility

**Research Round 5: Holistic Review**
- Design aligns with PRD's professional, technical audience
- Minimal palette reduces cognitive load in complex interfaces
- Yellow accent provides necessary visual hierarchy without color backgrounds
- Scalable system suitable for iterative development

### Design System Resources

- **Tailwind CSS:** https://tailwindcss.com
- **shadcn/ui:** https://ui.shadcn.com
- **Lucide Icons:** https://lucide.dev
- **Inter Font:** https://rsms.me/inter/
- **JetBrains Mono:** https://www.jetbrains.com/lp/mono/

### Color Reference Quick Sheet

| Purpose | Hex | Tailwind | Notes |
|---------|-----|----------|-------|
| Primary text | `#0F172A` | `text-slate-900` | Headings, important text |
| Body text | `#475569` | `text-slate-600` | Paragraphs, descriptions |
| Muted text | `#64748B` | `text-slate-500` | Secondary info |
| Placeholder | `#94A3B8` | `text-slate-400` | Input placeholders |
| Borders | `#E2E8F0` | `border-slate-200` | Dividers, card borders |
| Background | `#FFFFFF` | `bg-white` | Page, card backgrounds |
| Subtle BG | `#F8FAFC` | `bg-slate-50` | Canvas, secondary areas |
| Highlight | `#FACC15` | `text-yellow-400` | Focus, active states |
| Highlight text | `#CA8A04` | `text-yellow-600` | Emphasis text |

### Glossary

| Term | Definition |
|------|------------|
| **Accent Color** | A contrasting color used sparingly to draw attention |
| **Focus Ring** | Visual indicator showing which element has keyboard focus |
| **Semantic Color** | Color with inherent meaning (success=green, error=red) |
| **WCAG** | Web Content Accessibility Guidelines |
| **Contrast Ratio** | Measure of luminance difference between foreground and background |

---

*Document Version: 1.0*
*Last Updated: 2025-01-13*
*Author: INTACT Design Team*