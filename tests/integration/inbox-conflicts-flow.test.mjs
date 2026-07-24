import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempGitRepo, parseCreatedProjectId, removeTempDir, runCli, startTestDaemon } from './helpers.mjs';

function parseWorktreePath(output) {
  const match = output.match(/Worktree: (.+)/);
  if (!match) {
    throw new Error(`Could not parse worktree path from CLI output:\n${output}`);
  }
  return match[1].trim();
}

function parseMessageId(output) {
  const match = output.match(/\((msg_[^,\s]+)/);
  if (!match) {
    throw new Error(`Could not parse message id from CLI output:\n${output}`);
  }
  return match[1];
}

function parseConflictId(output) {
  const match = output.match(/(conf_[^\s]+)/);
  if (!match) {
    throw new Error(`Could not parse conflict id from CLI output:\n${output}`);
  }
  return match[1];
}

test('ask/reply inbox and conflict marker parsing resolve through CLI and daemon', async (t) => {
  const repoRoot = await createTempGitRepo();
  t.after(async () => {
    await removeTempDir(repoRoot);
  });

  const daemon = await startTestDaemon(repoRoot);
  t.after(async () => {
    await daemon.stop();
  });

  const ctx = { repoRoot, baseUrl: daemon.baseUrl };
  const init = runCli(['init', '--first-name', 'Nihal', '--last-name', 'T'], ctx);
  assert.equal(init.exitCode, 0, init.stderr || init.stdout);
  const create = runCli(['project', 'create', '--name', 'Inbox Conflicts'], ctx);
  assert.equal(create.exitCode, 0, create.stderr || create.stdout);
  const projectId = parseCreatedProjectId(create.stdout);

  const start = runCli(['start', 'handoff-flow', '--project', projectId], ctx);
  assert.equal(start.exitCode, 0, start.stderr || start.stdout);
  const nihalWorktree = parseWorktreePath(start.stdout);

  const joinResult = runCli(['join', 'handoff-flow', '--as', 'Kushagra'], ctx);
  assert.equal(joinResult.exitCode, 0, joinResult.stderr || joinResult.stdout);
  const kushagraWorktree = parseWorktreePath(joinResult.stdout);

  const ask = runCli(['ask', 'Kushagra', 'Should backend cap retry attempts?'], { ...ctx, cwd: nihalWorktree });
  assert.equal(ask.exitCode, 0, ask.stderr || ask.stdout);
  const messageId = parseMessageId(ask.stdout);

  const inbox = runCli(['inbox', '--all'], { ...ctx, cwd: kushagraWorktree });
  assert.equal(inbox.exitCode, 0, inbox.stderr || inbox.stdout);
  assert.match(inbox.stdout, new RegExp(messageId));
  assert.match(inbox.stdout, /Should backend cap retry attempts\?/);

  const reply = runCli(['reply', messageId, 'Yes, cap at three attempts and surface terminal auth errors.'], {
    ...ctx,
    cwd: kushagraWorktree
  });
  assert.equal(reply.exitCode, 0, reply.stderr || reply.stdout);
  assert.match(reply.stdout, new RegExp(`Replied to ${messageId}`));

  const answeredInbox = runCli(['inbox', '--all'], { ...ctx, cwd: nihalWorktree });
  assert.equal(answeredInbox.exitCode, 0, answeredInbox.stderr || answeredInbox.stdout);
  assert.match(answeredInbox.stdout, /answered/);
  assert.match(answeredInbox.stdout, /cap at three attempts/);

  const conflictText = [
    'Need to merge retry policy:',
    '<<<<<<< ours',
    'retry forever while token refresh is pending',
    '=======',
    'stop after three failed refresh attempts',
    '>>>>>>> kushagra'
  ].join('\n');
  const publishConflict = runCli(['publish', 'blockers.md', conflictText], { ...ctx, cwd: nihalWorktree });
  assert.equal(publishConflict.exitCode, 0, publishConflict.stderr || publishConflict.stdout);

  const conflicts = runCli(['conflicts'], { ...ctx, cwd: nihalWorktree });
  assert.equal(conflicts.exitCode, 0, conflicts.stderr || conflicts.stdout);
  assert.match(conflicts.stdout, /open\s+content\s+Conflict in blockers\.md/);
  const conflictId = parseConflictId(conflicts.stdout);

  const conflictsFile = await readFile(join(repoRoot, '.coord', 'workspaces', 'handoff-flow', 'vault', 'conflicts.md'), 'utf8');
  assert.match(conflictsFile, new RegExp(conflictId));
  assert.match(conflictsFile, /retry forever/);
  assert.match(conflictsFile, /stop after three failed refresh attempts/);

  const resolve = runCli(['conflicts', 'resolve', conflictId, 'Use the three-attempt cap.'], {
    ...ctx,
    cwd: nihalWorktree
  });
  assert.equal(resolve.exitCode, 0, resolve.stderr || resolve.stdout);

  const resolved = runCli(['conflicts'], { ...ctx, cwd: nihalWorktree });
  assert.equal(resolved.exitCode, 0, resolved.stderr || resolved.stdout);
  assert.match(resolved.stdout, new RegExp(`${conflictId}\\s+resolved`));

  const resolvedFile = await readFile(join(repoRoot, '.coord', 'workspaces', 'handoff-flow', 'vault', 'conflicts.md'), 'utf8');
  assert.match(resolvedFile, /Use the three-attempt cap\./);
});
