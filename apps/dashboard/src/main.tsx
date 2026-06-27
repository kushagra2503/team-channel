import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ProjectSelectionPage } from './pages/ProjectSelectionPage';
import { DashboardPage } from './pages/DashboardPage';
import './index.css';

const router = createBrowserRouter([
  { path: '/', element: <ProjectSelectionPage /> },
  { path: '/projects/:projectId', element: <DashboardPage /> },
]);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
