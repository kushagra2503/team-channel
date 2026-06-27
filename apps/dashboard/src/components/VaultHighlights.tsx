import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { Participant, VaultContext } from '@teambridge/core';
import { Badge } from '@/components/ui/badge';
import { buildAvatarUrl, type TeambridgeClientConfig } from '@/api/teambridgeClient';
import { avatarColor, participantInitials, prettyParticipantName } from './participantDisplay';

export type VaultHighlightsProps = {
  context?: VaultContext;
  error?: string;
  participants?: Participant[];
  workspaceId?: string;
  daemonBaseUrl?: string;
  repoRoot?: string;
  avatarRev?: number;
};

type VaultSection = { path: string; title: string; items: string[] };
type RowState = { color?: string; assignedId?: string };
type OpenMenus = { key: string; color: boolean; assign: boolean };

const MARK_COLORS = [
  { label: 'Red',    value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Green',  value: '#22c55e' },
  { label: 'Blue',   value: '#3b82f6' },
  { label: 'Purple', value: '#a855f7' },
];

function parseVaultSections(content: string): VaultSection[] {
  const sections: VaultSection[] = [];
  const pattern = /--- ([^-]+) ---\n([\s\S]*?)(?=\n--- |$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const path = match[1].trim();
    const useful = match[2].trim().split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.trim().startsWith('-'));
    if (useful.length > 0) {
      sections.push({
        path,
        title: path.replace(/\.md$/, '').replace(/-/g, ' '),
        items: useful.map((l) => l.replace(/^-\s*/, ''))
      });
    }
  }
  return sections;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

function ParticipantAvatar({ participant, workspaceId, config, avatarRev, size = 20 }: {
  participant: Participant; workspaceId?: string; config: TeambridgeClientConfig; avatarRev?: number; size?: number;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const avatarUrl = config.daemonBaseUrl && workspaceId
    ? buildAvatarUrl(workspaceId, participant.id, config, avatarRev)
    : undefined;
  const sz = `${size}px`;
  return (
    <span className="relative shrink-0" style={{ width: sz, height: sz }}>
      <span
        className="absolute inset-0 flex items-center justify-center rounded-full text-[9px] font-semibold text-white"
        style={{ backgroundColor: avatarColor(participant.id) }}
      >
        {participantInitials(participant.displayName)}
      </span>
      {avatarUrl ? (
        <img
          src={avatarUrl} alt="" width={size} height={size} loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className="absolute inset-0 rounded-full [image-rendering:pixelated] transition-opacity duration-200"
          style={{ opacity: imgLoaded ? 1 : 0, width: sz, height: sz }}
        />
      ) : null}
    </span>
  );
}

function AuthorChip({ participant, workspaceId, config, avatarRev }: {
  participant: Participant; workspaceId?: string; config: TeambridgeClientConfig; avatarRev?: number;
}) {
  const firstName = prettyParticipantName(participant.displayName).split(' ')[0];
  return (
    <span className="flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-muted/80 pl-0.5 pr-2">
      <ParticipantAvatar participant={participant} workspaceId={workspaceId} config={config} avatarRev={avatarRev} size={20} />
      <span className="select-none whitespace-nowrap text-xs">{firstName}</span>
    </span>
  );
}

function AssignedChip({ participant, workspaceId, config, avatarRev }: {
  participant: Participant; workspaceId?: string; config: TeambridgeClientConfig; avatarRev?: number;
}) {
  const firstName = prettyParticipantName(participant.displayName).split(' ')[0];
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted/60 py-0.5 pl-1 pr-2.5 text-xs text-muted-foreground select-none">
      <ParticipantAvatar participant={participant} workspaceId={workspaceId} config={config} avatarRev={avatarRev} size={16} />
      <span className="text-muted-foreground/60">Assigned to</span>
      <span className="text-foreground">{firstName}</span>
    </span>
  );
}

const ICON_COPY = (
  <svg key="copy" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const ICON_CHECK = (
  <svg key="check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);


function EntryRow({ item, participant, rowState, onColor, onAssign, onCopy, participants, workspaceId, config, avatarRev, openMenus, onToggleMenu, onCloseAll }: {
  item: string; participant?: Participant; rowState: RowState;
  onColor: (c: string | undefined) => void; onAssign: (id: string | undefined) => void; onCopy: () => void;
  participants: Participant[]; workspaceId?: string; config: TeambridgeClientConfig; avatarRev?: number;
  openMenus: OpenMenus | null; onToggleMenu: (t: 'color' | 'assign') => void; onCloseAll: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // No ref/useOutsideClick — backdrop handles outside clicks instead

  const assignedParticipant = rowState.assignedId
    ? participants.find((p) => p.id === rowState.assignedId)
    : undefined;

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const rowStyle = rowState.color
    ? { backgroundColor: rowState.color + '1a', borderLeft: `2px solid ${rowState.color}66` }
    : undefined;

  const anyOpen = openMenus?.color || openMenus?.assign;

  return (
    <li
      className="-mx-4 flex min-h-[2rem] items-center gap-1.5 px-4 py-1.5 transition-[background-color] duration-150 ease-out hover:bg-muted/60"
      style={rowStyle}
    >
      <span className="text-sm">{item}</span>

      {participant ? (
        <AuthorChip participant={participant} workspaceId={workspaceId} config={config} avatarRev={avatarRev} />
      ) : null}

      <span className={`relative flex shrink-0 items-center gap-0 transition-opacity duration-150 [li:hover_&]:opacity-100 ${anyOpen ? 'opacity-100' : 'opacity-0'}`}>
        {/* Color */}
        <button
          type="button"
          onClick={() => onToggleMenu('color')}
          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-[background-color] hover:bg-muted hover:text-foreground"
          title="Mark with color"
        >
          <span
            className="size-2.5 rounded-full border border-current transition-colors"
            style={rowState.color ? { backgroundColor: rowState.color, borderColor: rowState.color } : {}}
          />
        </button>

        {/* Copy */}
        <button
          type="button"
          onClick={handleCopy}
          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-[background-color,color] hover:bg-muted hover:text-foreground"
          title="Copy"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copied ? 'check' : 'copy'}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className={copied ? 'text-emerald-500' : ''}
            >
              {copied ? ICON_CHECK : ICON_COPY}
            </motion.span>
          </AnimatePresence>
        </button>

        {/* Assign */}
        <button
          type="button"
          onClick={() => onToggleMenu('assign')}
          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-[background-color] hover:bg-muted hover:text-foreground"
          title="Assign to teammate"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </button>

        {/* Color picker */}
        <AnimatePresence initial={false}>
          {openMenus?.color ? (
            <motion.span
              key="color-menu"
              layout
              initial={{ opacity: 0, scale: 0.9, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -6 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              style={{ transformOrigin: 'top left' }}
              className="absolute left-0 top-7 z-20 flex gap-1 rounded-lg border border-border bg-popover p-1 shadow-md"
            >
              <AnimatePresence initial={false}>
                {rowState.color ? (
                  <motion.button
                    key="remove-color"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 20, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                    type="button"
                    onClick={() => onColor(undefined)}
                    className="flex shrink-0 items-center justify-center overflow-hidden rounded-sm text-[10px] text-muted-foreground hover:bg-muted"
                    style={{ height: 20 }}
                    title="Remove color"
                  >✕</motion.button>
                ) : null}
              </AnimatePresence>
              {MARK_COLORS.map((c) => (
                <button
                  key={c.value} type="button" title={c.label}
                  onClick={() => onColor(c.value)}
                  className="size-5 shrink-0 rounded-full transition-transform duration-100 hover:scale-110 active:scale-95"
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </motion.span>
          ) : null}
        </AnimatePresence>

        {/* Assign dropdown */}
        <AnimatePresence initial={false}>
          {openMenus?.assign && participants.length > 0 ? (
            <motion.span
              key="assign-menu"
              layout
              initial={{ opacity: 0, scale: 0.9, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -6 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              style={{ transformOrigin: 'top left' }}
              className="absolute left-0 top-7 z-20 flex min-w-[160px] flex-col overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-md"
            >
              <AnimatePresence initial={false}>
                {assignedParticipant ? (
                  <motion.div
                    key="unassign"
                    initial={{ height: 0, marginBottom: 0, opacity: 0 }}
                    animate={{ height: 'auto', marginBottom: 2, opacity: 1 }}
                    exit={{ height: 0, marginBottom: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className="overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => onAssign(undefined)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
                    >Unassign</button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <div className="flex flex-col gap-0.5">
                {participants.map((p) => (
                  <button
                    key={p.id} type="button"
                    onClick={() => onAssign(p.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    <ParticipantAvatar participant={p} workspaceId={workspaceId} config={config} avatarRev={avatarRev} size={18} />
                    <span>{prettyParticipantName(p.displayName)}</span>
                  </button>
                ))}
              </div>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>

      {assignedParticipant ? (
        <span className="ml-auto">
          <AssignedChip participant={assignedParticipant} workspaceId={workspaceId} config={config} avatarRev={avatarRev} />
        </span>
      ) : null}
    </li>
  );
}

const ENTER = { opacity: 1, y: 0 } as const;
const HIDE = { opacity: 0, y: 6 } as const;

export function VaultHighlights({
  context, error, participants = [], workspaceId, daemonBaseUrl, repoRoot, avatarRev
}: VaultHighlightsProps) {
  const sections = useMemo(() => (context ? parseVaultSections(context.content) : []), [context?.content]);
  const config = useMemo<TeambridgeClientConfig>(() => ({ daemonBaseUrl, repoRoot }), [daemonBaseUrl, repoRoot]);

  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [openMenus, setOpenMenus] = useState<OpenMenus | null>(null);

  const setColor = useCallback((key: string, color: string | undefined) => {
    setRowStates((s) => ({ ...s, [key]: { ...s[key], color } }));
  }, []);

  const setAssigned = useCallback((key: string, assignedId: string | undefined) => {
    setRowStates((s) => ({ ...s, [key]: { ...s[key], assignedId } }));
  }, []);

  const copyItem = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
  }, []);

  if (error) return <p role="alert" className="text-xs text-destructive">{error}</p>;
  if (!context) return null;

  return (
    <section className="flex flex-col">
      {/* Backdrop — captures outside clicks when any menu is open */}
      {openMenus ? (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenus(null)} />
      ) : null}
      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No published notes yet.</p>
      ) : (
        sections.map((section, i) => (
          <motion.article
            key={section.path}
            initial={HIDE} animate={ENTER}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1], delay: i * 0.05 }}
            className="border-b border-border p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="select-none text-sm font-medium capitalize">{section.title}</h3>
              <Badge variant="outline">{section.path}</Badge>
            </div>
            <ul className="flex flex-col text-sm leading-relaxed text-foreground">
              {section.items.map((item) => {
                const key = `${section.path}::${item}`;
                const author = participants.length > 0
                  ? participants[hashString(item) % participants.length]
                  : undefined;
                return (
                  <EntryRow
                    key={key} item={item} participant={author}
                    rowState={rowStates[key] ?? {}}
                    onColor={(c) => setColor(key, c)}
                    onAssign={(id) => setAssigned(key, id)}
                    onCopy={() => copyItem(item)}
                    participants={participants}
                    workspaceId={workspaceId} config={config} avatarRev={avatarRev}
                    openMenus={openMenus?.key === key ? openMenus : null}
                    onToggleMenu={(type) => setOpenMenus((prev) => {
                      const base = prev?.key === key ? prev : { key, color: false, assign: false };
                      return { ...base, [type]: !base[type] };
                    })}
                    onCloseAll={() => setOpenMenus(null)}
                  />
                );
              })}
            </ul>
          </motion.article>
        ))
      )}
    </section>
  );
}
