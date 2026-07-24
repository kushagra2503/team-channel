import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project } from '@coord/core';
import { listKnownRepos, listProjects, getDefaultClientConfig, DEFAULT_DAEMON_BASE_URL } from '@/api/coordClient';
import { useAppShell } from '@/components/app-shell-context';
import { createCache } from '@/lib/cache';

const LAST_PROJECT_KEY = 'tb_last_project';
const PROJECT_LIST_REFRESH_MS = 5000;

type ProjectCard = Project & {
  repoRoot?: string;
};

function mergeProjectCards(currentProjects: Project[], discoveredProjects: ProjectCard[]): ProjectCard[] {
  const merged = new Map<string, ProjectCard>();

  for (const project of currentProjects) {
    merged.set(`current:${project.id}`, project);
  }

  for (const project of discoveredProjects) {
    merged.set(`${project.repoRoot ?? 'unknown'}:${project.id}`, project);
  }

  return [...merged.values()];
}

function setLastProjectId(id: string): void {
  try { sessionStorage.setItem(LAST_PROJECT_KEY, id); } catch { /* ignore */ }
}

export function ProjectSelectionPage() {
  const navigate = useNavigate();
  const { setHeader, resetHeader } = useAppShell();
  const config = useMemo(() => getDefaultClientConfig(), []);
  const cache = useMemo(() => createCache(config.daemonBaseUrl ?? DEFAULT_DAEMON_BASE_URL), [config.daemonBaseUrl]);

  const [projects, setProjects] = useState<ProjectCard[]>(() => cache.projects);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setHeader({ variant: 'projects' });
  }, [setHeader]);

  useEffect(() => () => resetHeader(), [resetHeader]);

  useEffect(() => {
    const controller = new AbortController();

    const loadProjects = async () => {
      try {
        const res = await listProjects(config, controller.signal);
        const known = await listKnownRepos(config, controller.signal);
        const discoveredProjects = known.repos.flatMap((repo) => (
          repo.projects.map((project) => ({
            ...project,
            repoRoot: repo.repoRoot
          }))
        ));
        const nextProjects = mergeProjectCards(res.projects, discoveredProjects);
        cache.setProjects(res.projects);
        setProjects(nextProjects);
        setError(undefined);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to reach local Coord daemon.');
        }
      }
    };

    void loadProjects();
    const refreshId = window.setInterval(() => {
      void loadProjects();
    }, PROJECT_LIST_REFRESH_MS);

    return () => {
      window.clearInterval(refreshId);
      controller.abort();
    };
  }, [config, cache]);

  function handleSelect(project: ProjectCard) {
    setLastProjectId(project.id);
    const params = new URLSearchParams(window.location.search);
    if (project.repoRoot) {
      params.set('repoRoot', project.repoRoot);
    }
    if (config.daemonBaseUrl) {
      params.set('daemonBaseUrl', config.daemonBaseUrl);
    }
    const query = params.toString();
    navigate(`/projects/${project.id}${query ? `?${query}` : ''}`);
  }

  return (
    <main className="flex-1 px-6 py-8">
      <div className="w-full max-w-4xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">
          Select a project
        </h1>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            No projects found for the current repo yet.
            <br />
            <code className="mt-2 block text-xs text-muted-foreground/60">Run coord init and project create in a repo.</code>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <button
                key={`${project.repoRoot ?? 'current'}:${project.id}`}
                type="button"
                onClick={() => handleSelect(project)}
                className="flex h-full w-full cursor-pointer flex-col items-start justify-start rounded-lg border border-border bg-card px-4 py-3.5 text-left transition-[background-color] duration-150 hover:bg-muted/60"
              >
                <span className="text-sm font-medium leading-none">{project.name}</span>
                {project.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
                ) : null}
                {project.repoRoot ? (
                  <span className="mt-2 block max-w-full truncate text-xs text-muted-foreground/60">
                    {project.repoRoot}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
