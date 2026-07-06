import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { RepoContext } from '@teambridge/core';
import {
  IconBrandGithub,
  IconCloudUpload,
  IconDeviceDesktop,
  IconGitBranch,
  IconGitFork
} from '@tabler/icons-react';
import { motion } from 'motion/react';
import type { TeambridgeClientConfig } from '@/api/teambridgeClient';
import { getRepoContext, openRepoPath } from '@/api/teambridgeClient';
import { cn } from '@/lib/utils';

export type RepoContextPanelProps = {
  workspaceId?: string;
  clientConfig: TeambridgeClientConfig;
};

const panelSpring = { type: 'spring' as const, duration: 0.32, bounce: 0 };

function formatLocalPath(path: string): string {
  const home = import.meta.env.VITE_HOME_DIR as string | undefined;
  if (home && path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path.replace(/^\/Users\/[^/]+/, '~');
}

function getRelativePushTime(iso: string | null): { text: string; minutesAgo: number } | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const diff = Math.max(0, Date.now() - then);
  const minutesAgo = Math.floor(diff / 60000);
  if (minutesAgo < 1) return { text: 'just now', minutesAgo: 0 };
  if (minutesAgo < 60) return { text: `${minutesAgo}m ago`, minutesAgo };
  const hours = Math.floor(minutesAgo / 60);
  if (hours < 24) return { text: `${hours}h ago`, minutesAgo };
  const days = Math.floor(hours / 24);
  if (days < 30) return { text: `${days}d ago`, minutesAgo };
  return { text: new Date(iso).toLocaleDateString(), minutesAgo };
}

const rowClassName =
  'flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-muted/50';

function ContextRow({
  href,
  onClick,
  icon,
  label,
  title,
  muted
}: {
  href?: string | null;
  onClick?: () => void;
  icon: ReactNode;
  label: ReactNode;
  title?: string;
  muted?: boolean;
}) {
  const className = cn(
    rowClassName,
    muted ? 'text-muted-foreground' : 'text-foreground',
    (href || onClick) && 'cursor-pointer'
  );

  const content = (
    <>
      <span className="shrink-0 opacity-70">{icon}</span>
      <span className="truncate">{label}</span>
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} title={title}>
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(className, 'text-left')} title={title}>
        {content}
      </button>
    );
  }

  return (
    <div className={className} title={title}>
      {content}
    </div>
  );
}

export function RepoContextPanel({ workspaceId, clientConfig }: RepoContextPanelProps) {
  const [context, setContext] = useState<RepoContext | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setError(undefined);

    void getRepoContext(clientConfig, workspaceId, controller.signal)
      .then((res) => setContext(res.context))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load repo context');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [clientConfig, workspaceId, clientConfig.repoRoot, clientConfig.daemonBaseUrl]);

  const handleOpenPath = useCallback(async () => {
    if (!context?.localPath || opening) return;
    setOpening(true);
    try {
      await openRepoPath(clientConfig, context.localPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open folder');
    } finally {
      setOpening(false);
    }
  }, [clientConfig, context?.localPath, opening]);

  const lastPushIso = context?.lastPushAt ?? context?.lastCommitAt ?? null;
  const lastPush = getRelativePushTime(lastPushIso);
  const isRecentPush = lastPush !== null && lastPush.minutesAgo < 15;
  const localLabel = context ? formatLocalPath(context.localPath) : '—';
  const iconClass = 'size-3.5 shrink-0';
  const iconStroke = 1.75;
  const showPanel = !loading && (context !== null || Boolean(error));

  return (
    <motion.div
      data-slot="repo-context-panel"
      className="w-full shrink-0 overflow-hidden border-b bg-background group-data-[collapsible=icon]:hidden"
      initial={false}
      animate={{ height: showPanel ? 'auto' : 0 }}
      transition={panelSpring}
    >
      <div className="py-2">
        {error ? <p className="px-3 text-xs text-destructive">{error}</p> : null}

        {context ? (
          <nav aria-label="Repository context">
            <ul className="flex w-full flex-col">
              <li>
                <ContextRow
                  onClick={handleOpenPath}
                  icon={<IconDeviceDesktop className={iconClass} stroke={iconStroke} />}
                  label={localLabel}
                  title={context.localPath}
                />
              </li>

              {context.branch ? (
                <li>
                  <ContextRow
                    href={context.branchWebUrl}
                    icon={<IconGitBranch className={iconClass} stroke={iconStroke} />}
                    label={context.branch}
                    title={context.branchWebUrl ?? context.branch}
                  />
                </li>
              ) : null}

              {context.repoLabel ? (
                <li>
                  <ContextRow
                    href={context.repoWebUrl}
                    icon={
                      context.remoteUrl?.includes('github.com') ? (
                        <IconBrandGithub className={iconClass} stroke={iconStroke} />
                      ) : (
                        <IconGitFork className={iconClass} stroke={iconStroke} />
                      )
                    }
                    label={context.repoLabel}
                    title={context.remoteUrl ?? context.repoLabel}
                  />
                </li>
              ) : (
                <li>
                  <ContextRow
                    icon={<IconGitFork className={iconClass} stroke={iconStroke} />}
                    label="Local repository"
                  />
                </li>
              )}

              {lastPush ? (
                <li>
                  <ContextRow
                    href={context.lastPushCommitWebUrl}
                    icon={<IconCloudUpload className={iconClass} stroke={iconStroke} />}
                    label={
                      <>
                        Last push{' '}
                        <span className={cn(isRecentPush && 'font-medium text-emerald-600 dark:text-emerald-500')}>
                          {lastPush.text}
                        </span>
                      </>
                    }
                    title={context.lastPushCommitSha ?? undefined}
                  />
                </li>
              ) : (
                <li>
                  <ContextRow
                    icon={<IconCloudUpload className={iconClass} stroke={iconStroke} />}
                    label="No push recorded"
                  />
                </li>
              )}
            </ul>
          </nav>
        ) : null}
      </div>
    </motion.div>
  );
}
