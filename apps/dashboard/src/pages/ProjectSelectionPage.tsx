import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import type { Project } from '@teambridge/core';
import { listProjects, getDefaultClientConfig, DEFAULT_DAEMON_BASE_URL } from '@/api/teambridgeClient';
import { useGridColumnCount } from '@/components/column-enter';
import { useAppShell } from '@/components/app-shell-context';
import { createCache } from '@/lib/cache';
import { COLUMN_DURATION, COLUMN_EASE, COLUMN_ENTER, COLUMN_HIDE, gridStaggerDelay } from '@/lib/motion';

const LAST_PROJECT_KEY = 'tb_last_project';

function setLastProjectId(id: string): void {
  try { sessionStorage.setItem(LAST_PROJECT_KEY, id); } catch { /* ignore */ }
}

export function ProjectSelectionPage() {
  const navigate = useNavigate();
  const { setHeader, resetHeader } = useAppShell();
  const gridColumns = useGridColumnCount();
  const config = useMemo(() => getDefaultClientConfig(), []);
  const cache = useMemo(() => createCache(config.daemonBaseUrl ?? DEFAULT_DAEMON_BASE_URL), [config.daemonBaseUrl]);

  const [projects, setProjects] = useState<Project[]>(() => cache.projects);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setHeader({ variant: 'projects' });
  }, [setHeader]);

  useEffect(() => () => resetHeader(), [resetHeader]);

  useEffect(() => {
    const controller = new AbortController();
    listProjects(config, controller.signal)
      .then((res) => {
        cache.setProjects(res.projects);
        setProjects(res.projects);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to reach local Teambridge daemon.');
        }
      });

    return () => controller.abort();
  }, [config, cache]);

  function handleSelect(project: Project) {
    setLastProjectId(project.id);
    navigate(`/projects/${project.id}`);
  }

  return (
    <main className="flex-1 px-6 py-8">
      <div className="w-full max-w-4xl">
        <motion.h1
          initial={COLUMN_HIDE}
          animate={COLUMN_ENTER}
          transition={{ duration: COLUMN_DURATION, ease: COLUMN_EASE }}
          className="mb-6 text-xl font-semibold tracking-tight"
        >
          Select a project
        </motion.h1>

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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, i) => (
              <motion.button
                key={project.id}
                type="button"
                initial={COLUMN_HIDE}
                animate={COLUMN_ENTER}
                transition={{
                  duration: COLUMN_DURATION,
                  delay: gridStaggerDelay(i, gridColumns),
                  ease: COLUMN_EASE
                }}
                onClick={() => handleSelect(project)}
                className="w-full cursor-pointer rounded-lg border border-border bg-card px-4 py-3.5 text-left transition-[background-color] duration-150 hover:bg-muted/60"
              >
                <span className="text-sm font-medium leading-none">{project.name}</span>
                {project.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
                ) : null}
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
