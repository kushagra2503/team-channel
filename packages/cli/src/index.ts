#!/usr/bin/env node
import { runInit } from './commands/init';
import { runProjectCreate, runProjectList } from './commands/project';
import { runTrackJoin, runTrackStart } from './commands/track';
import { runStart } from './commands/start';
import { runEnter } from './commands/enter';
import { runPublish } from './commands/publish';
import { runStatus } from './commands/status';
import { daemonBaseUrl, resolveRepoRoot } from './repo';

function usage(): void {
  console.log(`Teambridge CLI

Usage:
  teambridge init [--first-name NAME] [--last-name NAME] [--agent cursor|claude-code|codex]
  teambridge project create [--name NAME] [--description TEXT]
  teambridge project list
  teambridge track start [NAME] [--project PROJECT_ID] [--base-ref REF]
  teambridge track join [NAME] [--as DISPLAY_NAME]
  teambridge start [NAME] [--project PROJECT_ID] [--base-ref REF]
  teambridge enter <NAME>
  teambridge publish <TARGET_FILE> <TEXT>
  teambridge status

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

    if (command === 'track') {
      const sub = argv[1];
      if (sub === 'start') {
        await runTrackStart(argv.slice(2), options);
        return;
      }
      if (sub === 'join') {
        await runTrackJoin(argv.slice(2), options);
        return;
      }
      throw new Error('Usage: teambridge track start|join [NAME]');
    }

    if (command === 'start') {
      await runStart(argv.slice(1), options);
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

    if (command === 'status') {
      await runStatus(argv.slice(1), options);
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
