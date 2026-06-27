import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProjectSelectionPage } from './pages/ProjectSelectionPage';
import { DashboardPage } from './pages/DashboardPage';
import './index.css';

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/projects" replace /> },
      { path: '/projects', element: <ProjectSelectionPage /> },
      { path: '/projects/:projectId', element: <DashboardPage /> }
    ]
  }
]);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
