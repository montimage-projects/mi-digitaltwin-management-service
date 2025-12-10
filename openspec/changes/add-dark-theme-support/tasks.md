# Tasks

## 1. Theme Infrastructure

- [x] 1.1 Add dark theme CSS variables to `client/src/index.css` using login page color palette (#0a0a0b background, #dc2626 accent)
- [x] 1.2 Create `client/src/store/theme-store.ts` with Zustand for theme state management (theme: 'light' | 'dark', toggle, persistence)
- [x] 1.3 Update `client/src/App.tsx` to initialize theme from localStorage and apply `dark` class to document root

## 2. Layout Component Updates

- [x] 2.1 Update `client/src/components/layout/MainLayout.tsx` to apply theme class wrapper (not needed - Tailwind handles via CSS variables)
- [x] 2.2 Update `client/src/components/layout/Sidebar.tsx` to use dark theme compatible colors (inverted logo for dark mode)
- [x] 2.3 Update `client/src/components/layout/Header.tsx` to add theme toggle button (Sun/Moon icons)

## 3. Default Dark Theme

- [x] 3.1 Set dark theme as the default theme (matching login page)
- [x] 3.2 Ensure theme preference persists in localStorage

## 4. Verification

- [x] 4.1 Verify all pages render correctly in dark mode
- [x] 4.2 Verify theme toggle works and persists across page refreshes
- [x] 4.3 Verify shadcn/ui components (buttons, inputs, dialogs, tables) display correctly in dark mode
- [x] 4.4 Type check passes (`bunx tsc --noEmit`)
