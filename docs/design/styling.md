# Styling Guide

Tailwind CSS and shadcn/ui styling conventions.

## Technology Stack

| Technology    | Purpose                              |
| ------------- | ------------------------------------ |
| Tailwind CSS  | Utility-first CSS framework          |
| shadcn/ui     | Component library with design tokens |
| CSS Variables | Theme customization                  |
| PostCSS       | CSS processing                       |

## Color System

### Theme Colors

Colors are defined as CSS variables for light/dark mode support:

```css
/* index.css */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.5rem;
}
```

### Using Colors

```tsx
// Background colors
<div className="bg-background" />
<div className="bg-card" />
<div className="bg-muted" />

// Text colors
<p className="text-foreground" />
<p className="text-muted-foreground" />

// Border colors
<div className="border border-border" />

// Semantic colors
<Button variant="destructive" />
<Badge className="bg-primary" />
```

## Typography

### Font Sizes

```tsx
// Headings
<h1 className="text-4xl font-bold" />
<h2 className="text-3xl font-semibold" />
<h3 className="text-2xl font-semibold" />
<h4 className="text-xl font-semibold" />

// Body text
<p className="text-base" />
<p className="text-sm text-muted-foreground" />
<span className="text-xs" />
```

### Font Weights

| Class           | Weight | Usage            |
| --------------- | ------ | ---------------- |
| `font-normal`   | 400    | Body text        |
| `font-medium`   | 500    | Labels, emphasis |
| `font-semibold` | 600    | Subheadings      |
| `font-bold`     | 700    | Headings         |

## Spacing

### Spacing Scale

| Class   | Size    | Usage           |
| ------- | ------- | --------------- |
| `gap-1` | 0.25rem | Tight grouping  |
| `gap-2` | 0.5rem  | Related items   |
| `gap-4` | 1rem    | Default spacing |
| `gap-6` | 1.5rem  | Section spacing |
| `gap-8` | 2rem    | Large sections  |

### Common Patterns

```tsx
// Page padding
<div className="p-6" />

// Card padding
<CardContent className="p-4" />

// Form field spacing
<div className="space-y-4">
 <FormField />
 <FormField />
</div>

// Horizontal spacing
<div className="flex gap-2">
 <Button />
 <Button />
</div>
```

## Layout Utilities

### Flexbox

```tsx
// Horizontal alignment
<div className="flex items-center justify-between" />
<div className="flex items-center gap-2" />

// Vertical stack
<div className="flex flex-col gap-4" />

// Centering
<div className="flex items-center justify-center min-h-screen" />
```

### Grid

```tsx
// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" />

// Fixed columns
<div className="grid grid-cols-12 gap-4">
 <div className="col-span-8" />
 <div className="col-span-4" />
</div>
```

## Component Variants

### Button Variants

```tsx
// Primary (default)
<Button>Primary</Button>

// Secondary
<Button variant="secondary">Secondary</Button>

// Outline
<Button variant="outline">Outline</Button>

// Ghost
<Button variant="ghost">Ghost</Button>

// Destructive
<Button variant="destructive">Delete</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>
```

### Badge Variants

```tsx
<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="destructive">Destructive</Badge>
```

## Utility Patterns

### Conditional Classes

```tsx
import { cn } from '@/lib/utils';

// Using cn() for conditional classes
<button
  className={cn(
    'base-classes',
    isActive && 'active-classes',
    isDisabled && 'opacity-50 pointer-events-none'
  )}
/>;
```

### Hover and Focus States

```tsx
// Interactive states
<div className="hover:bg-muted transition-colors" />
<button className="focus:ring-2 focus:ring-ring focus:ring-offset-2" />

// Card hover
<Card className="hover:shadow-md transition-shadow cursor-pointer" />
```

### Responsive Design

```tsx
// Mobile-first responsive
<div
  className="
 px-4 md:px-6 lg:px-8
 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3
 text-sm md:text-base
"
/>
```

## Animation

### Transitions

```tsx
// Color transition
<div className="transition-colors duration-200" />

// All transitions
<div className="transition-all duration-300" />

// Specific properties
<div className="transition-transform hover:scale-105" />
```

### Built-in Animations

```tsx
// Spin (loading)
<Loader2 className="animate-spin" />

// Pulse
<div className="animate-pulse" />

// Bounce
<div className="animate-bounce" />
```

## Dark Mode

The application supports dark mode via CSS variables:

```css
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... other dark mode values */
}
```

Toggle implementation:

```tsx
function ThemeToggle() {
  const [theme, setTheme] = useState('light');

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme}>
      {theme === 'light' ? <Moon /> : <Sun />}
    </Button>
  );
}
```

## Best Practices

### Do

- Use semantic color variables (`text-foreground`, `bg-muted`)
- Use consistent spacing scale (`gap-4`, `p-6`)
- Use `cn()` for conditional classes
- Prefer composition over custom CSS
- Use responsive utilities mobile-first

### Don't

- Avoid inline styles
- Don't use arbitrary values unless necessary
- Don't override component styles directly
- Avoid mixing spacing conventions

## Related Documentation

- [UI Patterns](ui-patterns.md)
- [Frontend Architecture](../architecture/frontend.md)
