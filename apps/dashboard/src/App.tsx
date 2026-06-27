import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ProjectSelectionPage } from './pages/ProjectSelectionPage';
import { DashboardPage } from './pages/DashboardPage';

const router = createBrowserRouter([
  { path: '/', element: <ProjectSelectionPage /> },
  { path: '/projects/:projectId', element: <DashboardPage /> },
]);

/** Top-level application shell. Delegates routing to react-router-dom. */
export function App() {
  return <RouterProvider router={router} />;
}
