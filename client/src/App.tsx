import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';

// Import theme store to initialize theme on app load
import '@/store/theme-store';

import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { NotFound } from '@/pages/NotFound';

// Lazy load heavier pages for better initial load performance
const Services = lazy(() => import('@/pages/Services').then((m) => ({ default: m.Services })));
const AddService = lazy(() =>
  import('@/pages/AddService').then((m) => ({ default: m.AddService }))
);
const EditService = lazy(() =>
  import('@/pages/EditService').then((m) => ({ default: m.EditService }))
);
const Projects = lazy(() => import('@/pages/Projects').then((m) => ({ default: m.Projects })));
const AddProject = lazy(() =>
  import('@/pages/AddProject').then((m) => ({ default: m.AddProject }))
);
const EditProject = lazy(() =>
  import('@/pages/EditProject').then((m) => ({ default: m.EditProject }))
);
const ProjectDetail = lazy(() =>
  import('@/pages/ProjectDetail').then((m) => ({ default: m.ProjectDetail }))
);
const AddScenario = lazy(() =>
  import('@/pages/AddScenario').then((m) => ({ default: m.AddScenario }))
);
const EditScenario = lazy(() =>
  import('@/pages/EditScenario').then((m) => ({ default: m.EditScenario }))
);
const ScenarioDetail = lazy(() =>
  import('@/pages/ScenarioDetail').then((m) => ({ default: m.ScenarioDetail }))
);
const Infrastructure = lazy(() =>
  import('@/pages/Infrastructure').then((m) => ({ default: m.Infrastructure }))
);
const Monitoring = lazy(() =>
  import('@/pages/Monitoring').then((m) => ({ default: m.Monitoring }))
);
const Analytics = lazy(() => import('@/pages/Analytics').then((m) => ({ default: m.Analytics })));
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

// Data router (createBrowserRouter) is required for navigation-blocking APIs
// such as useBlocker, used by the scenario editor's unsaved-changes guard.
const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: '/', element: <Dashboard /> },
      {
        path: '/services',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Services />
          </Suspense>
        ),
      },
      {
        path: '/services/add',
        element: (
          <Suspense fallback={<PageLoader />}>
            <AddService />
          </Suspense>
        ),
      },
      {
        path: '/services/:id/edit',
        element: (
          <Suspense fallback={<PageLoader />}>
            <EditService />
          </Suspense>
        ),
      },
      {
        path: '/projects',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Projects />
          </Suspense>
        ),
      },
      {
        path: '/projects/add',
        element: (
          <Suspense fallback={<PageLoader />}>
            <AddProject />
          </Suspense>
        ),
      },
      {
        path: '/projects/:id',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ProjectDetail />
          </Suspense>
        ),
      },
      {
        path: '/projects/:id/edit',
        element: (
          <Suspense fallback={<PageLoader />}>
            <EditProject />
          </Suspense>
        ),
      },
      {
        path: '/projects/:projectId/scenarios/add',
        element: (
          <Suspense fallback={<PageLoader />}>
            <AddScenario />
          </Suspense>
        ),
      },
      {
        path: '/scenarios/:id',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ScenarioDetail />
          </Suspense>
        ),
      },
      {
        path: '/scenarios/:id/edit',
        element: (
          <Suspense fallback={<PageLoader />}>
            <EditScenario />
          </Suspense>
        ),
      },
      {
        path: '/infrastructure',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Infrastructure />
          </Suspense>
        ),
      },
      {
        path: '/monitoring',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Monitoring />
          </Suspense>
        ),
      },
      {
        path: '/analytics',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Analytics />
          </Suspense>
        ),
      },
      {
        path: '/settings',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Settings />
          </Suspense>
        ),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}

export default App;
