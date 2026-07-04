import test from 'node:test';
import assert from 'node:assert/strict';
import { createTempGitRepo, parseCreatedProjectId, removeTempDir, runCli, startTestDaemon } from './helpers.mjs';

function parseWorktreePath(output) {
  const match = output.match(/Worktree: (.+)/);
  if (!match) {
    throw new Error(`Could not parse worktree path from CLI output:\n${output}`);
  }
  return match[1].trim();
}

test('start + join + publish + vault read/context/search + ws who/branches, all from inside participant worktrees', async (t) => {
  const repoRoot = await createTempGitRepo();
  t.after(async () => {
    await removeTempDir(repoRoot);
  });

  const daemon = await startTestDaemon(repoRoot);
  t.after(async () => {
    await daemon.stop();
  });

  const ctx = { repoRoot, baseUrl: daemon.baseUrl };

  // Kushagra starts the track — this is the CLI's own default local profile, so
  // `init`/`project create`/`start` here are all "as Kushagra".
  runCli(['init', '--first-name', 'Kushagra', '--last-name', 'A'], ctx);
  const create = runCli(['project', 'create', '--name', 'Beacon'], ctx);
  assert.equal(create.exitCode, 0, create.stderr || create.stdout);
  const projectId = parseCreatedProjectId(create.stdout);

  const start = runCli(['start', 'auth-redesign', '--project', projectId], ctx);
  assert.equal(start.exitCode, 0, start.stderr || start.stdout);
  assert.match(start.stdout, /Started session "auth-redesign"/);
  const kushagraWorktree = parseWorktreePath(start.stdout);

  const entered = runCli(['enter', 'auth-redesign'], ctx);
  assert.equal(entered.exitCode, 0, entered.stderr || entered.stdout);
  assert.equal(entered.stdout.trim(), kushagraWorktree);

  // Ronish joins the same track under a different display name (still the same
  // local profile/daemon — Phase 1 dogfood simulates multiple participants
  // locally via `--as`.
  const join = runCli(['join', 'auth-redesign', '--as', 'Ronish'], ctx);
  assert.equal(join.exitCode, 0, join.stderr || join.stdout);
  const ronishWorktree = parseWorktreePath(join.stdout);
  assert.notEqual(ronishWorktree, kushagraWorktree);

  const joinNihal = runCli(['join', 'auth-redesign', '--as', 'Nihal'], ctx);
  assert.equal(joinNihal.exitCode, 0, joinNihal.stderr || joinNihal.stdout);
  const nihalWorktree = parseWorktreePath(joinNihal.stdout);
  assert.notEqual(nihalWorktree, kushagraWorktree);
  assert.notEqual(nihalWorktree, ronishWorktree);

  // Publish runs from INSIDE Kushagra's worktree — repoRoot resolution (U1) and
  // current-track resolution from the branch (U4/KTD4) both get exercised here.
  const publish = runCli(['publish', 'decisions.md', 'Backend owns invoice state'], { ...ctx, cwd: kushagraWorktree });
  assert.equal(publish.exitCode, 0, publish.stderr || publish.stdout);
  assert.match(publish.stdout, /Published to decisions\.md \(seq 1\)/);

  // Ronish reads it back from HIS worktree, not the main repo root.
  const read = runCli(['vault', 'read', 'decisions.md'], { ...ctx, cwd: ronishWorktree });
  assert.equal(read.exitCode, 0, read.stderr || read.stdout);
  assert.match(read.stdout, /Backend owns invoice state/);

  const context = runCli(['vault', 'context'], { ...ctx, cwd: ronishWorktree });
  assert.equal(context.exitCode, 0, context.stderr || context.stdout);
  assert.match(context.stdout, /Backend owns invoice state/);

  // A second publish gives the search-ranking scenario something to rank.
  const publish2 = runCli(['publish', 'observations.md', 'invoice invoice retries forever'], {
    ...ctx,
    cwd: kushagraWorktree
  });
  assert.equal(publish2.exitCode, 0, publish2.stderr || publish2.stdout);

  const search = runCli(['vault', 'search', 'invoice'], { ...ctx, cwd: ronishWorktree });
  assert.equal(search.exitCode, 0, search.stderr || search.stdout);
  const lines = search.stdout.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^observations\.md:\d+: .*invoice invoice/); // two occurrences ranks first
  assert.match(lines[1], /^decisions\.md:\d+: .*invoice state/);

  const searchNoMatch = runCli(['vault', 'search', 'nonexistent-term'], { ...ctx, cwd: ronishWorktree });
  assert.equal(searchNoMatch.exitCode, 0, searchNoMatch.stderr || searchNoMatch.stdout);
  assert.match(searchNoMatch.stdout, /No matches\./);

  // FTS5 special characters must never crash the daemon or leak a syntax error.
  const searchSpecialChars = runCli(['vault', 'search', '"*AND-OR NEAR/2'], { ...ctx, cwd: ronishWorktree });
  assert.equal(searchSpecialChars.exitCode, 0, searchSpecialChars.stderr || searchSpecialChars.stdout);

  // Rebuild-from-events parity (Scope Boundaries): search results must be
  // identical after the vault is deleted and rebuilt from events.jsonl.
  const trackList = await (
    await fetch(new URL(`/tracks?repoRoot=${encodeURIComponent(repoRoot)}`, daemon.baseUrl))
  ).json();
  const workspaceId = trackList.data.tracks.find((t) => t.sessionName === 'auth-redesign').id;
  const statusBeforeRebuild = await (
    await fetch(new URL(`/workspaces/${workspaceId}/status?repoRoot=${encodeURIComponent(repoRoot)}`, daemon.baseUrl))
  ).json();
  assert.equal(statusBeforeRebuild.data.participants.length, 3);
  assert.equal(statusBeforeRebuild.data.worktrees.length, 3);
  assert.equal(new Set(statusBeforeRebuild.data.worktrees.map((worktree) => worktree.path)).size, 3);
  assert.deepEqual(
    [...new Set(statusBeforeRebuild.data.worktrees.map((worktree) => worktree.baseCommit))],
    [statusBeforeRebuild.data.workspace.baseCommit]
  );

  const rebuildUrl = new URL(`/workspaces/${workspaceId}/vault/rebuild`, daemon.baseUrl);
  const rebuildResponse = await fetch(rebuildUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repoRoot })
  });
  assert.equal(rebuildResponse.status, 200);

  const searchAfterRebuild = runCli(['vault', 'search', 'invoice'], { ...ctx, cwd: ronishWorktree });
  assert.equal(searchAfterRebuild.exitCode, 0, searchAfterRebuild.stderr || searchAfterRebuild.stdout);
  assert.equal(searchAfterRebuild.stdout, search.stdout);

  // ws who/branches show both participants, from either worktree.
  const who = runCli(['ws', 'who', 'auth-redesign'], { ...ctx, cwd: kushagraWorktree });
  assert.equal(who.exitCode, 0, who.stderr || who.stdout);
  assert.match(who.stdout, /Kushagra A/);
  assert.match(who.stdout, /Ronish/);
  assert.match(who.stdout, /Nihal/);

  const branches = runCli(['ws', 'branches', 'auth-redesign'], { ...ctx, cwd: ronishWorktree });
  assert.equal(branches.exitCode, 0, branches.stderr || branches.stdout);
  assert.match(branches.stdout, /teambridge\/auth-redesign\/kushagra-a/);
  assert.match(branches.stdout, /teambridge\/auth-redesign\/ronish/);
  assert.match(branches.stdout, /teambridge\/auth-redesign\/nihal/);
});
