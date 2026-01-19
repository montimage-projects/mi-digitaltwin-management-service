# Component Reference

Reference guide for React components used in the MI Digital Twin Management Service.

## Overview

The component library is built on:

- **shadcn/ui** - Pre-built, accessible components
- **Radix UI** - Headless, unstyled UI components
- **Tailwind CSS** - Utility-first styling
- **Lucide React** - Beautiful, consistent icons

## shadcn/ui Base Components

These are the foundational UI primitives from shadcn/ui located in `client/src/components/ui/`.

### Button

Basic interactive button component.

**Props:**

```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
  disabled?: boolean;
}
```

**Usage:**

```tsx
import { Button } from '@/components/ui/button';

export function Example() {
  return (
    <>
      <Button>Default Button</Button>
      <Button variant="destructive">Delete</Button>
      <Button variant="outline" size="sm">
        Small Outline
      </Button>
      <Button disabled>Disabled</Button>
      <Button size="icon">
        <Icon size={16} />
      </Button>
    </>
  );
}
```

### Dialog

Modal dialog component for overlays and confirmations.

**Props:**

```typescript
interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}
```

**Usage:**

```tsx
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function Example() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
```

### Form

Form component built on React Hook Form with Zod validation.

**Usage:**

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export function LoginForm() {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = (data) => console.log(data);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
```

### Input

Basic text input field.

**Props:**

```typescript
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'email' | 'password' | 'number' | 'search' | 'url' | 'tel';
}
```

**Usage:**

```tsx
import { Input } from '@/components/ui/input'

<Input placeholder="Enter text..." />
<Input type="email" placeholder="Email..." />
<Input type="password" placeholder="Password..." />
<Input type="search" placeholder="Search..." />
```

### Select

Dropdown select component.

**Usage:**

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function Example() {
  return (
    <Select>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select option" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="option1">Option 1</SelectItem>
        <SelectItem value="option2">Option 2</SelectItem>
        <SelectItem value="option3">Option 3</SelectItem>
      </SelectContent>
    </Select>
  );
}
```

### Table

Data table component for displaying tabular data.

**Usage:**

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function ServiceTable({ services }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {services.map((service) => (
          <TableRow key={service.id}>
            <TableCell>{service.name}</TableCell>
            <TableCell>{service.category}</TableCell>
            <TableCell>{service.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

### Card

Container component for grouping content.

**Usage:**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function Example() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description</CardDescription>
      </CardHeader>
      <CardContent>Card content goes here</CardContent>
    </Card>
  );
}
```

## Layout Components

Custom components for application layout in `client/src/components/layout/`.

### MainLayout

Root layout wrapper with sidebar and header.

**Props:**

```typescript
interface MainLayoutProps {
  children: React.ReactNode;
}
```

**Usage:**

```tsx
<MainLayout>
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/services" element={<Services />} />
</MainLayout>
```

### Sidebar

Navigation sidebar with menu items.

**Features:**

- Collapsible menu
- Active route highlighting
- Icon + label navigation
- Responsive mobile behavior

### ProtectedRoute

Wrapper ensuring only authenticated users can access routes.

**Props:**

```typescript
interface ProtectedRouteProps {
  children: React.ReactNode;
}
```

**Usage:**

```tsx
<Routes>
  <Route path="/login" element={<Login />} />
  <Route
    path="/dashboard"
    element={
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    }
  />
</Routes>
```

## Feature Components

Components for specific features located in `client/src/components/`.

### Services Components

**ServiceCard**

- Display single service in grid layout
- Show name, description, category badge
- Hover state with actions

**ServiceTable**

- Display services in tabular format
- Sortable columns
- Batch actions (delete, export)

**ServiceForm**

- Create/edit service modal
- Name, description, category fields
- Form validation with Zod

**ServiceDrawer**

- Side panel for service details
- Full service information
- Actions (edit, delete, export)

### Projects Components

**ProjectCard**

- Project summary display
- Sector badge
- Scenario count
- Actions menu

**ProjectForm**

- Create/edit project dialog
- Name, description, sector selection
- Owner assignment

**ProjectTable**

- List all projects
- Sort by name, created date
- Inline edit/delete

### Scenarios Components

**ScenarioEditor**

- Create/edit scenario form
- Topology editor integration
- Service selection

**TopologyEditor**

- Visual canvas for building scenarios
- React Flow nodes and edges
- YAML synchronization

**TopologyCanvas**

- React Flow canvas wrapper
- Service node rendering
- Edge/connection visualization

**YamlEditor**

- Monaco editor for YAML
- Syntax highlighting
- Real-time validation

### Infrastructure Components

**InfrastructureForm**

- Create/edit infrastructure
- Type selection (Kubernetes, Docker, VM)
- Credential input fields
- Connection test button

**CredentialsInput**

- Secure credential entry
- Password masking
- Auto-validation

## Hooks

Custom React hooks in `client/src/hooks/`.

### useAuth

Access authentication state and actions.

**Returns:**

```typescript
{
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (credentials) => Promise<void>
  logout: () => void
}
```

**Usage:**

```tsx
import { useAuth } from '@/hooks/useAuth';

export function Profile() {
  const { user, logout } = useAuth();
  return (
    <>
      <h1>{user?.username}</h1>
      <Button onClick={logout}>Logout</Button>
    </>
  );
}
```

### useServices

Fetch and manage services data.

**Returns:**

```typescript
{
  services: Service[]
  isLoading: boolean
  error: Error | null
  refetch: () => void
}
```

**Usage:**

```tsx
import { useServices } from '@/hooks/useServices';

export function ServiceList() {
  const { services, isLoading } = useServices();
  return isLoading ? <Spinner /> : <ServiceTable services={services} />;
}
```

### useProjects

Fetch and manage projects data.

**Usage:**

```tsx
const { projects, isLoading, error } = useProjects();
```

### useScenarios

Fetch and manage scenarios data.

**Usage:**

```tsx
const { scenarios, isLoading } = useScenarios(projectId);
```

### useInfrastructures

Fetch and manage infrastructure data.

**Usage:**

```tsx
const { infrastructures, isLoading } = useInfrastructures();
```

## API Client

Centralized API calls in `client/src/lib/api.ts`.

**Available methods:**

```typescript
// Authentication
api.login(credentials: LoginCredentials)
api.getMe()
api.logout()

// Services
api.getServices(filters?: ServiceFilters)
api.getService(id: string)
api.createService(data: ServiceCreateInput)
api.updateService(id: string, data: ServiceUpdateInput)
api.deleteService(id: string)

// Projects
api.getProjects(filters?: ProjectFilters)
api.getProject(id: string)
api.createProject(data: ProjectCreateInput)
api.updateProject(id: string, data: ProjectUpdateInput)
api.deleteProject(id: string)

// Scenarios
api.getScenarios(filters?: ScenarioFilters)
api.getScenario(id: string)
api.createScenario(data: ScenarioCreateInput)
api.updateScenario(id: string, data: ScenarioUpdateInput)
api.deleteScenario(id: string)
api.executeScenario(id: string, data: ExecuteInput)

// Infrastructures
api.getInfrastructures()
api.getInfrastructure(id: string)
api.createInfrastructure(data: InfraCreateInput)
api.updateInfrastructure(id: string, data: InfraUpdateInput)
api.deleteInfrastructure(id: string)
api.testInfrastructure(id: string)
```

**Usage:**

```tsx
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function ServiceList() {
  const { data: services, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: api.getServices,
  })

  const createMutation = useMutation({
    mutationFn: api.createService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })

  return (
    // Component JSX
  )
}
```

## Styling & Utilities

### cn() Utility

Combine Tailwind classes conditionally.

```tsx
import { cn } from '@/lib/utils';

<div className={cn('p-4', isActive && 'bg-blue-500', className)}>Content</div>;
```

### Tailwind Theme Colors

```typescript
// Light mode (default)
bg-white, text-black, border-gray-200

// Dark mode (if enabled)
dark:bg-slate-950, dark:text-white, dark:border-slate-800

// shadcn colors
bg-background, text-foreground, border-border
```

## Icons

Using Lucide React for icons.

```tsx
import { Menu, Search, Settings, Bell, LogOut } from 'lucide-react';

<Button size="icon">
  <Menu className="h-4 w-4" />
</Button>;
```

**Common icons:**

- Navigation: Menu, ChevronRight, ChevronDown
- Actions: Plus, Edit, Trash, Download, Copy
- Status: AlertCircle, CheckCircle, Clock, AlertTriangle
- Social: Github, Mail, Linkedin, Twitter
- UI: X, Search, Settings, Bell, Eye, EyeOff

## Component Development Guidelines

### Creating a New Component

1. **Create file** in appropriate directory
2. **Add TypeScript types** for props
3. **Use shadcn/ui** for base components
4. **Apply Tailwind** for styling
5. **Document props** with JSDoc comments
6. **Export from index** if in ui/

### Example Component

```tsx
import React from 'react';
import { cn } from '@/lib/utils';

interface CustomComponentProps {
  /** Main heading text */
  title: string;
  /** Optional description below title */
  description?: string;
  /** Callback when submitted */
  onSubmit: (data: any) => void;
  /** Additional CSS classes */
  className?: string;
}

export const CustomComponent = React.forwardRef<HTMLDivElement, CustomComponentProps>(
  ({ title, description, onSubmit, className }, ref) => (
    <div ref={ref} className={cn('p-4', className)}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="text-sm text-gray-600">{description}</p>}
    </div>
  )
);

CustomComponent.displayName = 'CustomComponent';
```

## Related Documentation

- [Frontend Architecture](architecture/frontend.md) - Component structure overview
- [UI Patterns](design/ui-patterns.md) - Design patterns and conventions
- [Styling Guide](design/styling.md) - CSS/Tailwind guidelines
- [shadcn/ui](https://ui.shadcn.com/) - Component library documentation
- [Radix UI](https://www.radix-ui.com/) - Headless UI components
- [Lucide Icons](https://lucide.dev/) - Icon library
