import { execFileSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import type { AgentKind } from '@coord/core';

export type LaunchAgent = Exclude<AgentKind, 'unknown'> | 'shell';

const AGENT_ALIASES: Record<string, LaunchAgent> = {
  claude: 'claude-code',
  'claude-code': 'claude-code',
  codex: 'codex',
  cursor: 'cursor',
  ghost: 'ghost',
  shell: 'shell'
};

const AGENT_COMMANDS: Record<LaunchAgent, string> = {
  'claude-code': 'claude',
  codex: 'codex',
  cursor: 'cursor',
  ghost: 'ghost',
  shell: process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/sh')
};

export function normalizeAgent(value: string): LaunchAgent {
  const agent = AGENT_ALIASES[value.trim().toLowerCase()];
  if (!agent) {
    throw new Error(`Unknown agent "${value}". Use claude, codex, cursor, ghost, or shell.`);
  }
  return agent;
}

export function agentCommand(agent: LaunchAgent): string {
  return AGENT_COMMANDS[agent];
}

export function commandExists(command: string): boolean {
  if (command.includes('/') || command.includes('\\')) {
    try {
      accessSync(command, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], {
      stdio: 'ignore',
      timeout: 2_000
    });
    return true;
  } catch {
    return false;
  }
}

export function detectDefaultAgent(): LaunchAgent | undefined {
  for (const agent of ['claude-code', 'codex', 'cursor', 'ghost'] as const) {
    if (commandExists(agentCommand(agent))) return agent;
  }
  return undefined;
}

export function displayAgent(agent: LaunchAgent): string {
  if (agent === 'claude-code') return 'Claude Code';
  if (agent === 'codex') return 'Codex';
  if (agent === 'cursor') return 'Cursor';
  if (agent === 'ghost') return 'Ghost';
  return 'shell';
}
