import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import type { Project } from '@teambridge/core';
import { listProjects, getDefaultClientConfig, DEFAULT_DAEMON_BASE_URL } from '@/api/teambridgeClient';
import { createCache } from '@/lib/cache';

const LAST_PROJECT_KEY = 'tb_last_project';

function getLastProjectId(): string | null {
  try { return sessionStorage.getItem(LAST_PROJECT_KEY); } catch { return null; }
}
function setLastProjectId(id: string): void {
  try { sessionStorage.setItem(LAST_PROJECT_KEY, id); } catch { /* ignore */ }
}

export function ProjectSelectionPage() {
  const navigate = useNavigate();
  const config = useMemo(() => getDefaultClientConfig(), []);
  const cache = useMemo(() => createCache(config.daemonBaseUrl ?? DEFAULT_DAEMON_BASE_URL), [config.daemonBaseUrl]);

  const [projects, setProjects] = useState<Project[]>(() => cache.projects);
  const [error, setError] = useState<string>();

  useEffect(() => {
    // Auto-navigate to last visited project if we have one cached
    const lastId = getLastProjectId();
    if (lastId && cache.projects.some((p) => p.id === lastId)) {
      navigate(`/projects/${lastId}`, { replace: true });
      return;
    }

    const controller = new AbortController();
    listProjects(config, controller.signal)
      .then((res) => {
        cache.setProjects(res.projects);
        setProjects(res.projects);

        // Auto-navigate if exactly one project
        if (res.projects.length === 1) {
          navigate(`/projects/${res.projects[0].id}`, { replace: true });
        }

        // Check lastId again with freshly fetched data
        const fresh = getLastProjectId();
        if (fresh && res.projects.some((p) => p.id === fresh)) {
          navigate(`/projects/${fresh}`, { replace: true });
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to reach local Teambridge daemon.');
        }
      });

    return () => controller.abort();
  }, [config, cache, navigate]);

  function handleSelect(project: Project) {
    setLastProjectId(project.id);
    navigate(`/projects/${project.id}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 select-none">
      <div className="w-full max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className="mb-10"
        >
          <h1 className="text-2xl font-semibold tracking-tight">Select a project</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a project to open its dashboard
          </p>
        </motion.div>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            No projects found — run the seed script to populate demo data.
            <br />
            <code className="mt-2 block text-xs text-muted-foreground/60">pnpm seed</code>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {projects.map((project, i) => (
              <motion.button
                key={project.id}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.05, ease: [0.23, 1, 0.32, 1] }}
                onClick={() => handleSelect(project)}
                className="group flex w-full items-start justify-between rounded-xl border border-border bg-card p-5 text-left transition-[background-color,box-shadow] duration-150 hover:bg-card/80 hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex-1">
                  <span className="text-base font-medium leading-none">{project.name}</span>
                  {project.description ? (
                    <p className="mt-1.5 text-sm text-muted-foreground">{project.description}</p>
                  ) : null}
                </div>
                <span className="ml-4 mt-0.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </span>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
