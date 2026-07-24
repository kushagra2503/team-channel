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
import { runWork } from './commands/work';
import { daemonBaseUrl, resolveRepoRoot } from './repo';

function usage(): void {
  console.log(`Coord CLI

Usage:
  coord                              Select a track and launch your default agent
  coord init [--first-name NAME] [--last-name NAME] [--agent AGENT] [--project-name NAME] [--no-project]
  coord work [TRACK] [--agent AGENT] [--claude|--codex|--cursor|--ghost|--shell] [--no-launch]
  coord project create [--name NAME] [--description TEXT]
  coord project list
  coord start [NAME] [BASE_REF] [--project PROJECT_ID]
  coord join [NAME] [--as DISPLAY_NAME]
  coord login --email EMAIL --password PASSWORD
  coord sessions
  coord list
  coord sync
  coord enter <NAME>
  coord publish <TARGET_FILE> <TEXT>
  coord ask <PARTICIPANT> <QUESTION>
  coord inbox [--all]
  coord reply <MESSAGE_ID> <ANSWER>
  coord conflicts [--open]
  coord conflicts detect
  coord conflicts resolve <CONFLICT_ID> <RESOLUTION>
  coord vault read <PATH>
  coord vault context
  coord vault search <QUERY>
  coord context [--json] [--peek] [--deltas-only] [--full]
  coord hook install|uninstall|status
  coord ws show|who|branches <NAME>
  coord daemon start|status|stop [--port PORT]
  coord status
  coord mcp

Environment:
  COORD_DAEMON_URL   default http://127.0.0.1:9473
  COORD_DAEMON_PORT  used when URL unset

Coord automatically starts a local daemon for \`init\` and \`work\`.`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? 'work';

  if (
    command === '--help'
    || command === '-h'
    || command === 'help'
    || argv.includes('--help')
    || argv.includes('-h')
  ) {
    usage();
    return;
  }

  const repoRoot = resolveRepoRoot();
  const options = { repoRoot, baseUrl: daemonBaseUrl() };

  try {
    if (command === 'init') {
      await runInit(argv.slice(1), options);
      return;
    }

    if (command === 'work') {
      await runWork(argv.slice(1), options);
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
      throw new Error('Usage: coord project create|list');
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
    console.error(`coord: ${message}`);
    process.exit(1);
  }
}

void main();
