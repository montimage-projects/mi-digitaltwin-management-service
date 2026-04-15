import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';

// Import theme store to initialize theme on app load
import '@/store/theme-store';

import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { ChatPanel } from '@/components/agent/ChatPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ChatFab } from '@/components/agent/ChatFab';
import { useAgentStore } from '@/store/agent-store';
import { useAuthStore } from '@/store/auth-store';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';

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

function App() {
  const isOpen = useAgentStore((state) => state.isOpen);
  const togglePanel = useAgentStore((state) => state.togglePanel);
  const isStreaming = useAgentStore((state) => state.isStreaming);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route
                path="/services"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Services />
                  </Suspense>
                }
              />
              <Route
                path="/services/:id"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Services />
                  </Suspense>
                }
              />
              <Route
                path="/services/add"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <AddService />
                  </Suspense>
                }
              />
              <Route
                path="/services/:id/edit"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <EditService />
                  </Suspense>
                }
              />
              <Route
                path="/projects"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Projects />
                  </Suspense>
                }
              />
              <Route
                path="/projects/add"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <AddProject />
                  </Suspense>
                }
              />
              <Route
                path="/projects/:id"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <ProjectDetail />
                  </Suspense>
                }
              />
              <Route
                path="/projects/:id/edit"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <EditProject />
                  </Suspense>
                }
              />
              <Route
                path="/projects/:projectId/scenarios/add"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <AddScenario />
                  </Suspense>
                }
              />
              <Route
                path="/scenarios/:id"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <ScenarioDetail />
                  </Suspense>
                }
              />
              <Route
                path="/scenarios/:id/edit"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <EditScenario />
                  </Suspense>
                }
              />
              <Route
                path="/infrastructure"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Infrastructure />
                  </Suspense>
                }
              />
              <Route
                path="/analytics"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Analytics />
                  </Suspense>
                }
              />
              <Route
                path="/settings"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Settings />
                  </Suspense>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
        {isAuthenticated && (
          <>
            <ChatPanel />
            {!isOpen && (
              <ChatFab open={isOpen} onClick={togglePanel} attention={isStreaming && !isOpen} />
            )}
          </>
        )}
        <Toaster position="top-right" richColors />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
