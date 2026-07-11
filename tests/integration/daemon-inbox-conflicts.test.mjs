import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  apiGet,
  apiPost,
  createTempGitRepo,
  parseCreatedProjectId,
  parseStartedWorkspaceId,
  removeTempDir,
  runCli,
  startTestDaemon
} from './helpers.mjs';

test('daemon inbox and conflict endpoints work end-to-end', async (t) => {
  const repoRoot = await createTempGitRepo();
  t.after(() => removeTempDir(repoRoot));

  const daemon = await startTestDaemon(repoRoot);
  t.after(() => daemon.stop());

  const ctx = { repoRoot, baseUrl: daemon.baseUrl };

  runCli(['init', '--first-name', 'Alice', '--last-name', 'T'], ctx);
  const create = runCli(['project', 'create', '--name', 'InboxPrj'], ctx);
  assert.equal(create.exitCode, 0, create.stderr || create.stdout);
  const projectId = parseCreatedProjectId(create.stdout);

  const start = runCli(['start', 'inbox-track', '--project', projectId], ctx);
  assert.equal(start.exitCode, 0, start.stderr || start.stdout);
  const workspaceId = parseStartedWorkspaceId(start.stdout);

  const join = runCli(['join', 'inbox-track', '--as', 'Bob'], ctx);
  assert.equal(join.exitCode, 0, join.stderr || join.stdout);

  // Alice asks Bob a question.
  const ask = await apiPost(
    `/workspaces/${workspaceId}/inbox/ask`,
    { to: 'Bob', text: 'Can we use FTS5 for vault search?' },
    ctx
  );
  assert.equal(ask.body.ok, true, ask.body.error?.message);
  assert.equal(ask.body.data.status, 'pending');
  assert.equal(ask.body.data.body, 'Can we use FTS5 for vault search?');
  const messageId = ask.body.data.id;

  // Inbox lists the pending message.
  const inbox = await apiGet(`/workspaces/${workspaceId}/inbox`, ctx);
  assert.equal(inbox.body.ok, true);
  assert.ok(inbox.body.data.messages.length >= 1);
  const listed = inbox.body.data.messages.find((m) => m.id === messageId);
  assert.ok(listed);
  assert.equal(listed.status, 'pending');

  // Switch local profile to Bob so he can reply.
  await writeFile(
    path.join(repoRoot, '.teambridge', 'user.json'),
    JSON.stringify({ schemaVersion: 1, firstName: 'Bob', lastName: 'B', displayName: 'Bob' }, null, 2)
  );

  // Bob replies.
  const reply = await apiPost(
    `/workspaces/${workspaceId}/inbox/${messageId}/reply`,
    { text: 'Yes, FTS5 is included in the sqlite3 build.' },
    ctx
  );
  assert.equal(reply.body.ok, true, reply.body.error?.message);
  assert.equal(reply.body.data.status, 'answered');
  assert.equal(reply.body.data.replyText, 'Yes, FTS5 is included in the sqlite3 build.');

  // Inbox reflects the answered state.
  const inboxAfterReply = await apiGet(`/workspaces/${workspaceId}/inbox`, ctx);
  const answered = inboxAfterReply.body.data.messages.find((m) => m.id === messageId);
  assert.equal(answered.status, 'answered');

  // Two publishes to the same file trigger a conflict.
  const pub1 = await apiPost(
    `/workspaces/${workspaceId}/events`,
    { targetFile: 'decisions.md', payload: { text: 'First decision' }, repoRoot },
    ctx
  );
  assert.equal(pub1.body.ok, true, pub1.body.error?.message);
  const pub2 = await apiPost(
    `/workspaces/${workspaceId}/events`,
    { targetFile: 'decisions.md', payload: { text: 'Second decision' }, repoRoot },
    ctx
  );
  assert.equal(pub2.body.ok, true, pub2.body.error?.message);

  const conflicts = await apiGet(`/workspaces/${workspaceId}/conflicts`, ctx);
  assert.equal(conflicts.body.ok, true);
  assert.ok(conflicts.body.data.conflicts.length >= 1, 'Expected a conflict from two publishes');
  const conflict = conflicts.body.data.conflicts[0];
  assert.equal(conflict.status, 'open');
  assert.ok(conflict.affectedPaths.includes('decisions.md'));

  // Resolve the conflict.
  const resolveRes = await apiPost(
    `/workspaces/${workspaceId}/conflicts/${conflict.id}/resolve`,
    { conflictId: conflict.id, resolutionText: 'Merged both decisions', repoRoot },
    ctx
  );
  assert.equal(resolveRes.body.ok, true, resolveRes.body.error?.message);
  assert.equal(resolveRes.body.data.status, 'resolved');
  assert.equal(resolveRes.body.data.resolutionText, 'Merged both decisions');

  // Conflicts list no longer shows the resolved conflict as open.
  const conflictsAfterResolve = await apiGet(`/workspaces/${workspaceId}/conflicts`, ctx);
  assert.equal(conflictsAfterResolve.body.data.conflicts.length, 0, 'Open conflicts should be empty after resolve');

  // Context pointer starts at 0 and can be updated.
  const pointer = await apiGet(`/workspaces/${workspaceId}/context-pointer`, ctx);
  assert.equal(pointer.body.ok, true);
  assert.equal(pointer.body.data.lastSeenSeq, 0);

  const setPointer = await apiPost(
    `/workspaces/${workspaceId}/context-pointer`,
    { lastSeenSeq: 7 },
    ctx
  );
  assert.equal(setPointer.body.ok, true);
  assert.equal(setPointer.body.data.lastSeenSeq, 7);

  const pointerAfter = await apiGet(`/workspaces/${workspaceId}/context-pointer`, ctx);
  assert.equal(pointerAfter.body.data.lastSeenSeq, 7);
});
