import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProjectSelectionPage } from './pages/ProjectSelectionPage';
import { DashboardPage } from './pages/DashboardPage';

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

/** Top-level application shell. Delegates routing to react-router-dom. */
export function App() {
  return <RouterProvider router={router} />;
}
