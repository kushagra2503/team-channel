#!/usr/bin/env node
import { runInit } from './commands/init';
import { runProjectCreate, runProjectList } from './commands/project';
import { runTrackJoin } from './commands/track';
import { runStart } from './commands/start';
import { runEnter } from './commands/enter';
import { runPublish } from './commands/publish';
import { runVault } from './commands/vault';
import { runContext } from './commands/context';
import { runHook } from './commands/hook';
import { runAsk, runConflicts, runInbox, runReply } from './commands/inbox';
import { runWs } from './commands/ws';
import { runStatus } from './commands/status';
import { runDaemon } from './commands/daemon';
import { runLogin, runRelayStatus, runSessions, runSync } from './commands/relay';
import { runMcp } from './commands/mcp';
import { daemonBaseUrl, resolveRepoRoot } from './repo';

function usage(): void {
  console.log(`Teambridge CLI

Usage:
  teambridge init [--first-name NAME] [--last-name NAME] [--agent cursor|claude-code|codex] [--relay local|supabase]
  teambridge project create [--name NAME] [--description TEXT]
  teambridge project list
  teambridge start [NAME] [BASE_REF] [--project PROJECT_ID]
  teambridge join [NAME] [--as DISPLAY_NAME]
  teambridge login --email EMAIL --password PASSWORD
  teambridge sessions
  teambridge list
  teambridge sync
  teambridge enter <NAME>
  teambridge publish <TARGET_FILE> <TEXT>
  teambridge ask <PARTICIPANT> <QUESTION>
  teambridge inbox [--all]
  teambridge reply <MESSAGE_ID> <ANSWER>
  teambridge conflicts [--open]
  teambridge conflicts detect
  teambridge conflicts resolve <CONFLICT_ID> <RESOLUTION>
  teambridge vault read <PATH>
  teambridge vault context
  teambridge vault search <QUERY>
  teambridge context [--json] [--peek] [--deltas-only] [--full]
  teambridge hook install|uninstall|status
  teambridge ws show|who|branches <NAME>
  teambridge daemon start|status|stop [--port PORT]
  teambridge status
  teambridge mcp

Environment:
  TEAMBRIDGE_DAEMON_URL   default http://127.0.0.1:9473
  TEAMBRIDGE_DAEMON_PORT  used when URL unset

Run \`pnpm daemon\` in another terminal before CLI commands.`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (!command || command === '--help' || command === '-h') {
    usage();
    process.exit(command ? 0 : 1);
  }

  const repoRoot = resolveRepoRoot();
  const options = { repoRoot, baseUrl: daemonBaseUrl() };

  try {
    if (command === 'init') {
      await runInit(argv.slice(1), options);
      return;
    }

    if (command === 'project') {
      const sub = argv[1];
      if (sub === 'create') {
        await runProjectCreate(argv.slice(2), options);
        return;
      }
      if (sub === 'list') {
        await runProjectList(argv.slice(2), options);
        return;
      }
      throw new Error('Usage: teambridge project create|list');
    }

    if (command === 'start') {
      await runStart(argv.slice(1), options);
      return;
    }

    if (command === 'join') {
      await runTrackJoin(argv.slice(1), options);
      return;
    }

    if (command === 'login') {
      await runLogin(argv.slice(1), options);
      return;
    }

    if (command === 'sessions' || command === 'list') {
      await runSessions(argv.slice(1), options);
      return;
    }

    if (command === 'sync') {
      await runSync(argv.slice(1), options);
      return;
    }

    if (command === 'enter') {
      await runEnter(argv.slice(1), options);
      return;
    }

    if (command === 'publish') {
      await runPublish(argv.slice(1), options);
      return;
    }

    if (command === 'ask') {
      await runAsk(argv.slice(1), options);
      return;
    }

    if (command === 'inbox') {
      await runInbox(argv.slice(1), options);
      return;
    }

    if (command === 'reply') {
      await runReply(argv.slice(1), options);
      return;
    }

    if (command === 'conflicts') {
      await runConflicts(argv.slice(1), options);
      return;
    }

    if (command === 'vault') {
      await runVault(argv.slice(1), options);
      return;
    }

    if (command === 'context') {
      await runContext(argv.slice(1), options);
      return;
    }

    if (command === 'hook') {
      await runHook(argv.slice(1), options);
      return;
    }

    if (command === 'ws') {
      await runWs(argv.slice(1), options);
      return;
    }

    if (command === 'status') {
      if (argv[1] === 'relay') {
        await runRelayStatus(argv.slice(2), options);
      } else {
        await runStatus(argv.slice(1), options);
      }
      return;
    }

    if (command === 'daemon') {
      await runDaemon(argv.slice(1), options);
      return;
    }

    if (command === 'mcp') {
      await runMcp();
      return;
    }

    usage();
    process.exit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`teambridge: ${message}`);
    process.exit(1);
  }
}

void main();
