import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ClientOptions } from '../daemon-client';
import { getConfig } from '../daemon-client';
import { parseFlag } from '../prompt';

/**
 * The command a Coord worktree's Claude Code SessionStart hook runs. Its
 * stdout is injected as additional context, so an agent opening the worktree
 * automatically sees the shared vault plus what changed since last time —
 * "hooks only make Claude Code feel automatic" (agent.md rule 7). No
 * per-session flags: once installed, it just runs.
 */
const HOOK_COMMAND = 'coord context';
const HOOK_MARKER = 'coord context';

type CommandHook = { type: 'command'; command: string };
type SessionStartEntry = { matcher?: string; hooks: CommandHook[] };
type ClaudeSettings = {
  hooks?: { SessionStart?: SessionStartEntry[]; [key: string]: unknown };
  [key: string]: unknown;
};

function settingsPath(cwd: string): string {
  return join(cwd, '.claude', 'settings.json');
}

function readSettings(path: string): ClaudeSettings {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ClaudeSettings;
  } catch {
    throw new Error(`Could not parse ${path} as JSON — fix or remove it before running \`coord hook install\`.`);
  }
}

function writeSettings(path: string, settings: ClaudeSettings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}

function entryTargetsCoord(entry: SessionStartEntry): boolean {
  return entry.hooks.some((hook) => hook.type === 'command' && hook.command.includes(HOOK_MARKER));
}

function isInstalled(settings: ClaudeSettings): boolean {
  return (settings.hooks?.SessionStart ?? []).some(entryTargetsCoord);
}

async function runHookInstall(argv: string[], options: ClientOptions, cwd: string): Promise<void> {
  const command = parseFlag(argv, '--command') ?? HOOK_COMMAND;
  const path = settingsPath(cwd);
  const settings = readSettings(path);

  const config = await getConfig(options);
  const autoInject = config.ok ? config.data.config.autoInject : true;

  const hooks = (settings.hooks ??= {});
  const sessionStart = (hooks.SessionStart ??= []);

  if (isInstalled(settings)) {
    // Refresh the command in case it changed, keep it idempotent.
    for (const entry of sessionStart) {
      if (entryTargetsCoord(entry)) {
        entry.hooks = entry.hooks.map((hook) =>
          hook.command.includes(HOOK_MARKER) ? { type: 'command', command } : hook
        );
      }
    }
    writeSettings(path, settings);
    console.log(`Coord SessionStart hook already present — refreshed in ${path}`);
  } else {
    sessionStart.push({ hooks: [{ type: 'command', command }] });
    writeSettings(path, settings);
    console.log(`Installed Coord SessionStart hook in ${path}`);
    console.log(`Command: ${command}`);
  }

  if (!autoInject) {
    console.log('Note: config.autoInject is false — the hook is installed but you disabled auto-injection in .coord/config.json.');
  }
  console.log('New Claude Code sessions in this worktree will now receive shared context automatically.');
}

function runHookUninstall(cwd: string): void {
  const path = settingsPath(cwd);
  if (!existsSync(path)) {
    console.log('No .claude/settings.json here — nothing to uninstall.');
    return;
  }
  const settings = readSettings(path);
  const sessionStart = settings.hooks?.SessionStart;
  if (!sessionStart || !isInstalled(settings)) {
    console.log('Coord SessionStart hook is not installed here.');
    return;
  }

  const remaining = sessionStart
    .map((entry) => ({ ...entry, hooks: entry.hooks.filter((hook) => !hook.command.includes(HOOK_MARKER)) }))
    .filter((entry) => entry.hooks.length > 0);

  if (remaining.length > 0) {
    settings.hooks!.SessionStart = remaining;
  } else {
    delete settings.hooks!.SessionStart;
    if (settings.hooks && Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }
  }
  writeSettings(path, settings);
  console.log(`Removed Coord SessionStart hook from ${path}`);
}

async function runHookStatus(options: ClientOptions, cwd: string): Promise<void> {
  const path = settingsPath(cwd);
  const installed = existsSync(path) && isInstalled(readSettings(path));
  const config = await getConfig(options);
  const autoInject = config.ok ? config.data.config.autoInject : undefined;

  console.log(`Settings file: ${path}`);
  console.log(`SessionStart hook installed: ${installed ? 'yes' : 'no'}`);
  console.log(`Hook command: ${HOOK_COMMAND}`);
  if (autoInject !== undefined) {
    console.log(`config.autoInject: ${autoInject}`);
  }
  if (!installed) {
    console.log('Run `coord hook install` from inside your worktree to enable auto-injection.');
  }
}

export async function runHook(argv: string[], options: ClientOptions): Promise<void> {
  const sub = argv[0];
  const cwd = process.cwd();

  if (sub === 'install') {
    await runHookInstall(argv.slice(1), options, cwd);
    return;
  }
  if (sub === 'uninstall') {
    runHookUninstall(cwd);
    return;
  }
  if (sub === 'status') {
    await runHookStatus(options, cwd);
    return;
  }
  throw new Error('Usage: coord hook install [--command CMD]|uninstall|status');
}
