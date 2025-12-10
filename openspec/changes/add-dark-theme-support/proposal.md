# Change: Add Dark Theme Support

## Why

The login page features an elegant dark theme design with the INTACT brand colors (dark charcoal backgrounds, red accents). However, once users log in, they are presented with a light-themed application that feels visually inconsistent. Adding dark theme support will create a cohesive visual experience that matches the professional, technical aesthetic established by the login page.

## What Changes

- Add dark theme CSS variables to `index.css` matching the login page color palette
- Set dark theme as the default (matching login page aesthetic)
- Update layout components (Sidebar, Header, MainLayout) to use theme-aware Tailwind classes
- Ensure all shadcn/ui components properly inherit dark theme styles
- Add theme toggle in the Header for users who prefer light mode
- Create theme context/store to manage and persist theme preference

## Impact

- Affected specs: `frontend-shell` (layout, theming requirements)
- Affected code:
  - `client/src/index.css` - Add `.dark` theme CSS variables
  - `client/src/components/layout/Header.tsx` - Add theme toggle
  - `client/src/components/layout/Sidebar.tsx` - Ensure dark theme compatibility
  - `client/src/components/layout/MainLayout.tsx` - Apply theme class
  - `client/src/store/theme-store.ts` (new) - Theme state management
  - `client/src/App.tsx` - Initialize theme from storage
