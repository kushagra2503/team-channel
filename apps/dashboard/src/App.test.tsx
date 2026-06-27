import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShellProvider } from './components/app-shell-context';
import { SidebarProvider } from './components/ui/sidebar';
import { ProjectSelectionPage } from './pages/ProjectSelectionPage';
import { DashboardPage } from './pages/DashboardPage';
import { makeVaultContext, makeWorkspace, makeWorkspaceStatus } from './test/factories';

const api = vi.hoisted(() => ({
  getDefaultClientConfig: vi.fn(() => ({})),
  DEFAULT_DAEMON_BASE_URL: 'http://127.0.0.1:9473',
  listProjects: vi.fn(),
  getProjectMembers: vi.fn(),
  getProjectTracks: vi.fn(),
  listWorkspaces: vi.fn(),
  getWorkspaceStatus: vi.fn(),
  getVaultContext: vi.fn()
}));

vi.mock('./api/teambridgeClient', () => api);

function renderAtRoute(path: string, element: React.ReactElement, withSidebar = false) {
  const routes = (
    <Routes>
      <Route path="/projects" element={<ProjectSelectionPage />} />
      <Route path="/projects/:projectId" element={element} />
    </Routes>
  );

  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShellProvider>
        {withSidebar ? <SidebarProvider>{routes}</SidebarProvider> : routes}
      </AppShellProvider>
    </MemoryRouter>
  );
}

describe('ProjectSelectionPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    api.getDefaultClientConfig.mockReturnValue({});
  });

  it('shows a list of projects fetched from the API', async () => {
    api.listProjects.mockResolvedValue({
      projects: [
        { id: 'proj_1', name: 'Beacon', description: 'Analytics platform', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'proj_2', name: 'Forge', description: 'Dev tooling', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }
      ]
    });

    renderAtRoute('/projects', <ProjectSelectionPage />);

    expect(await screen.findByText('Beacon')).toBeTruthy();
    expect(screen.getByText('Forge')).toBeTruthy();
    expect(screen.getByText('Analytics platform')).toBeTruthy();
  });

  it('shows an error message when the API is unreachable', async () => {
    api.listProjects.mockRejectedValue(new Error('Unable to reach local Teambridge daemon.'));

    renderAtRoute('/projects', <ProjectSelectionPage />);

    expect(await screen.findByText('Unable to reach local Teambridge daemon.')).toBeTruthy();
  });

  it('shows empty state when no projects exist', async () => {
    api.listProjects.mockResolvedValue({ projects: [] });

    renderAtRoute('/projects', <ProjectSelectionPage />);

    expect(await screen.findByText(/No projects found/)).toBeTruthy();
  });
});

describe('DashboardPage', () => {
  const projectId = 'proj_beacon';

  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    api.getDefaultClientConfig.mockReturnValue({});
    // Prevent unhandled rejection from listProjects call inside DashboardPage
    api.listProjects.mockResolvedValue({ projects: [] });
  });

  it('loads tracks and renders vault content for the selected track', async () => {
    const track = makeWorkspace({ id: 'ws_track1', sessionName: 'data-ingestion', projectId });
    api.getProjectTracks.mockResolvedValue({ tracks: [track] });
    api.getProjectMembers.mockResolvedValue({ members: [] });
    api.getWorkspaceStatus.mockResolvedValue(makeWorkspaceStatus({ workspace: track, lastSeq: 2 }));
    api.getVaultContext.mockResolvedValue({ context: makeVaultContext() });

    renderAtRoute(`/projects/${projectId}`, <DashboardPage />, true);

    expect(await screen.findByText(/Backend owns invoice state/)).toBeTruthy();
    expect(api.getWorkspaceStatus).toHaveBeenCalledWith('ws_track1', {}, expect.any(AbortSignal));
  });

  it('shows track loading errors', async () => {
    api.getProjectTracks.mockRejectedValue(new Error('Unable to load tracks.'));
    api.getProjectMembers.mockResolvedValue({ members: [] });

    renderAtRoute(`/projects/${projectId}`, <DashboardPage />, true);

    expect(await screen.findByText('Unable to load tracks.')).toBeTruthy();
  });
});
