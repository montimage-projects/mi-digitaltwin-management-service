## ADDED Requirements

### Requirement: Dark Theme Support

The system SHALL support a dark theme that matches the login page aesthetic.

#### Scenario: Dark theme default

- **WHEN** a user visits the application for the first time
- **THEN** the dark theme is applied by default
- **AND** the application background uses dark charcoal colors (#0a0a0b, #0f0f11)
- **AND** text colors are light (white, rgba(255,255,255,0.7))
- **AND** accent colors use the INTACT red (#dc2626)

#### Scenario: Theme CSS variables defined

- **WHEN** the dark theme is active
- **THEN** the following CSS variables are defined in the `.dark` class:
  - `--background` maps to dark charcoal (#0a0a0b)
  - `--foreground` maps to white
  - `--card` and `--popover` map to slightly lighter dark (#0f0f11)
  - `--primary` uses INTACT red (#dc2626)
  - `--border` and `--input` use subtle white transparency

#### Scenario: Layout components dark themed

- **WHEN** the dark theme is active
- **THEN** the Sidebar background is dark with light text
- **AND** the Header background is dark with light text
- **AND** the INTACT logo in the Sidebar is inverted to white

### Requirement: Theme Toggle

The system SHALL provide a theme toggle control in the Header.

#### Scenario: Theme toggle display

- **WHEN** the Header renders
- **THEN** a theme toggle button is displayed
- **AND** it shows a Sun icon when dark theme is active
- **AND** it shows a Moon icon when light theme is active

#### Scenario: Theme toggle interaction

- **WHEN** the user clicks the theme toggle button
- **THEN** the theme switches between light and dark
- **AND** the change is applied immediately to all components

### Requirement: Theme Persistence

The system SHALL persist the user's theme preference.

#### Scenario: Theme saved to storage

- **WHEN** the user changes the theme
- **THEN** the preference is saved to localStorage

#### Scenario: Theme loaded from storage

- **WHEN** the application loads
- **THEN** the theme preference is read from localStorage
- **AND** if no preference exists, dark theme is used as default
