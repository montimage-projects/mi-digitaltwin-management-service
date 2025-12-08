import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Services } from '@/pages/Services';
import { AddService } from '@/pages/AddService';
import { EditService } from '@/pages/EditService';
import { Projects } from '@/pages/Projects';
import { AddProject } from '@/pages/AddProject';
import { EditProject } from '@/pages/EditProject';
import { ProjectDetail } from '@/pages/ProjectDetail';
import { AddScenario } from '@/pages/AddScenario';
import { EditScenario } from '@/pages/EditScenario';
import { ScenarioDetail } from '@/pages/ScenarioDetail';
import { Infrastructure } from '@/pages/Infrastructure';
import { Analytics } from '@/pages/Analytics';
import { Settings } from '@/pages/Settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
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
            <Route path="/services" element={<Services />} />
            <Route path="/services/add" element={<AddService />} />
            <Route path="/services/:id/edit" element={<EditService />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/add" element={<AddProject />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/projects/:id/edit" element={<EditProject />} />
            <Route path="/projects/:projectId/scenarios/add" element={<AddScenario />} />
            <Route path="/scenarios/:id" element={<ScenarioDetail />} />
            <Route path="/scenarios/:id/edit" element={<EditScenario />} />
            <Route path="/infrastructure" element={<Infrastructure />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}

export default App;
