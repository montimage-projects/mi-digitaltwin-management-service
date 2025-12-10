# frontend-shell Specification

## Purpose

TBD - created by archiving change implement-sprint0-poc. Update Purpose after archive.

## Requirements

### Requirement: React Application Setup

The system SHALL provide a React single-page application with modern tooling.

#### Scenario: Vite development server

- **WHEN** `bun run dev` is executed in the client directory
- **THEN** Vite starts a development server with hot module replacement
- **AND** the application is accessible at `http://localhost:5173`

#### Scenario: Tailwind CSS configured

- **WHEN** the application renders
- **THEN** Tailwind CSS utility classes are available
- **AND** the slate color palette is configured as the primary theme

#### Scenario: shadcn/ui components available

- **WHEN** UI components are needed
- **THEN** shadcn/ui components (Button, Input, Table, etc.) are available
- **AND** they are styled consistently with the brand kit

### Requirement: Authentication State Management

The system SHALL manage authentication state using Zustand.

#### Scenario: Auth store structure

- **WHEN** the auth store is initialized
- **THEN** it provides `user`, `token`, `isAuthenticated`, `login`, `logout` state and actions

#### Scenario: Token persistence

- **WHEN** a user logs in successfully
- **THEN** the JWT token is stored in localStorage
- **AND** the token persists across page refreshes

#### Scenario: Token cleared on logout

- **WHEN** a user logs out
- **THEN** the token is removed from localStorage
- **AND** auth state is cleared

### Requirement: API Client

The system SHALL provide a configured HTTP client for API requests.

#### Scenario: Authorization header attached

- **WHEN** an authenticated request is made
- **THEN** the `Authorization: Bearer <token>` header is automatically included

#### Scenario: 401 response handling

- **WHEN** an API request returns 401 Unauthorized
- **THEN** the user is logged out
- **AND** redirected to the login page

### Requirement: Application Routing

The system SHALL provide client-side routing with protected routes.

#### Scenario: Route definitions

- **WHEN** the application loads
- **THEN** the following routes are available:
  - `/login` - Login page (public)
  - `/` - Dashboard (protected)
  - `/services` - Service Repository (protected)
  - `/projects` - Digital Twin Projects (protected, placeholder)
  - `/infrastructure` - Infrastructure (protected, placeholder)
  - `/analytics` - Analytics (protected, placeholder)
  - `/settings` - Settings (protected, placeholder)

#### Scenario: Protected route access denied

- **WHEN** an unauthenticated user visits a protected route
- **THEN** they are redirected to `/login`

#### Scenario: Authenticated redirect from login

- **WHEN** an authenticated user visits `/login`
- **THEN** they are redirected to `/`

### Requirement: Application Layout

The system SHALL provide a consistent layout shell for all pages.

#### Scenario: MainLayout structure

- **WHEN** a protected page renders
- **THEN** it displays within a layout containing:
  - Fixed sidebar (w-64) on the left
  - Header at the top
  - Main content area

#### Scenario: Sidebar navigation

- **WHEN** the sidebar renders
- **THEN** it displays navigation items for all main routes
- **AND** the active route is highlighted
- **AND** each item has an icon (Lucide React)

#### Scenario: Header user menu

- **WHEN** the header renders
- **THEN** it displays the current username
- **AND** provides a logout button/menu item

### Requirement: Login Page

The system SHALL provide a login page with form validation.

#### Scenario: Login form display

- **WHEN** the login page renders
- **THEN** it displays username and password input fields
- **AND** a submit button

#### Scenario: Form validation

- **WHEN** the form is submitted with empty fields
- **THEN** validation errors are displayed
- **AND** the form is not submitted to the API

#### Scenario: Successful login

- **WHEN** valid credentials are submitted
- **THEN** the API is called with credentials
- **AND** on success, the user is redirected to the dashboard
- **AND** auth state is updated

#### Scenario: Failed login

- **WHEN** invalid credentials are submitted
- **THEN** an error message is displayed
- **AND** the form remains on screen

#### Scenario: Loading state

- **WHEN** the login form is submitted
- **THEN** a loading indicator is shown on the submit button
- **AND** the form inputs are disabled

### Requirement: Service Repository Page

The system SHALL provide a page to view services in the repository.

#### Scenario: Two-table layout

- **WHEN** the Services page renders
- **THEN** it displays two sections:
  - "INTACT Toolbox" table for `repositoryTable: INTACT_TOOLBOX`
  - "Other Services" table for `repositoryTable: OTHER_SERVICES`

#### Scenario: Table columns

- **WHEN** a service table renders
- **THEN** it displays columns: Short Name, Title, Category (badge), Provider, Version

#### Scenario: Loading state

- **WHEN** services are being fetched
- **THEN** skeleton loaders are displayed in place of table rows

#### Scenario: Empty state

- **WHEN** no services match the current filters
- **THEN** an empty state message is displayed

#### Scenario: Search filter

- **WHEN** text is entered in the search input
- **THEN** the service list is filtered by name/title (debounced)

#### Scenario: Category filter

- **WHEN** a category is selected from the dropdown
- **THEN** only services in that category are displayed

#### Scenario: Provider filter

- **WHEN** a provider is selected from the dropdown
- **THEN** only services from that provider are displayed

### Requirement: Service Detail Drawer

The system SHALL provide a slide-out drawer to view service details.

#### Scenario: Opening drawer

- **WHEN** a service row is clicked
- **THEN** a drawer slides in from the right side
- **AND** displays full service metadata

#### Scenario: Drawer content

- **WHEN** the drawer is open
- **THEN** it displays:
  - Title, Short Name, Provider
  - Description (full text)
  - Category, TRL (current/expected)
  - License, Standards
  - Inputs, Outputs, Interactions
  - Docker Image URL (copyable)
  - Potential Use Cases
  - Version history list

#### Scenario: Closing drawer

- **WHEN** the close button is clicked or area outside drawer is clicked
- **THEN** the drawer closes with smooth animation

#### Scenario: Keyboard accessibility

- **WHEN** the drawer is open and Escape key is pressed
- **THEN** the drawer closes
