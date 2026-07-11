import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiGet, createTempGitRepo, parseCreatedProjectId, removeTempDir, runCli, startTestDaemon } from './helpers.mjs';

function parseWorktreePath(output) {
  const match = output.match(/Worktree: (.+)/);
  if (!match) {
    throw new Error(`Could not parse worktree path from CLI output:\n${output}`);
  }
  return match[1].trim();
}

function readConfig(repoRoot) {
  return JSON.parse(readFileSync(join(repoRoot, '.teambridge', 'config.json'), 'utf8'));
}

test('init relay-mode config + context deltas + hook install/uninstall', async (t) => {
  const repoRoot = await createTempGitRepo();
  t.after(async () => {
    await removeTempDir(repoRoot);
  });

  const daemon = await startTestDaemon(repoRoot);
  t.after(async () => {
    await daemon.stop();
  });

  const ctx = { repoRoot, baseUrl: daemon.baseUrl };

  // --- Relay-mode configuration in `teambridge init` (Phase 2 Step 2) ---
  const init = runCli(['init', '--first-name', 'Ctx', '--last-name', 'User', '--relay', 'supabase'], ctx);
  assert.equal(init.exitCode, 0, init.stderr || init.stdout);
  assert.match(init.stdout, /Relay mode: supabase/);
  assert.equal(readConfig(repoRoot).defaultRelayMode, 'supabase');

  // Re-running init is idempotent but can update just the relay mode.
  const reinit = runCli(['init', '--relay', 'local'], ctx);
  assert.equal(reinit.exitCode, 0, reinit.stderr || reinit.stdout);
  assert.match(reinit.stdout, /Relay mode set to local/);
  assert.match(reinit.stdout, /already initialized for Ctx User/);
  assert.equal(readConfig(repoRoot).defaultRelayMode, 'local');

  const create = runCli(['project', 'create', '--name', 'Beacon'], ctx);
  assert.equal(create.exitCode, 0, create.stderr || create.stdout);
  const projectId = parseCreatedProjectId(create.stdout);

  const start = runCli(['start', 'ctx-track', '--project', projectId], ctx);
  assert.equal(start.exitCode, 0, start.stderr || start.stdout);
  const worktree = parseWorktreePath(start.stdout);
  const wt = { ...ctx, cwd: worktree };

  // --- `teambridge context` — smart compact context + deltas (Phase 3) ---
  // No events yet: context reports an empty delta.
  const emptyContext = runCli(['context'], wt);
  assert.equal(emptyContext.exitCode, 0, emptyContext.stderr || emptyContext.stdout);
  assert.match(emptyContext.stdout, /## Shared vault context/);
  assert.match(emptyContext.stdout, /No new updates since your last context pull\./);

  runCli(['publish', 'decisions.md', 'Backend owns invoice state'], wt);

  // First pull after the publish surfaces it as a delta and advances the cursor.
  const firstDelta = runCli(['context'], wt);
  assert.equal(firstDelta.exitCode, 0, firstDelta.stderr || firstDelta.stdout);
  assert.match(firstDelta.stdout, /New since you last looked \(seq 0 → 1\)/);
  assert.match(firstDelta.stdout, /- \[decisions\.md\].*Backend owns invoice state/);
  // Compaction strips the "# Decisions" markdown title from the shared block.
  assert.doesNotMatch(firstDelta.stdout.split('## New since')[0], /# Decisions/);

  // Cursor advanced — a second pull shows no new updates.
  const secondPull = runCli(['context'], wt);
  assert.match(secondPull.stdout, /New since you last looked \(seq 1 → 1\)/);
  assert.match(secondPull.stdout, /No new updates since your last context pull\./);

  runCli(['publish', 'observations.md', 'Refresh retries forever'], wt);

  // --peek shows the new delta without advancing the cursor.
  const peek1 = runCli(['context', '--peek'], wt);
  assert.match(peek1.stdout, /New since you last looked \(seq 1 → 2\)/);
  assert.match(peek1.stdout, /Refresh retries forever/);
  const peek2 = runCli(['context', '--peek'], wt);
  assert.match(peek2.stdout, /New since you last looked \(seq 1 → 2\)/);

  // --deltas-only --json returns structured deltas and omits the context body.
  const jsonOut = runCli(['context', '--deltas-only', '--json', '--peek'], wt);
  assert.equal(jsonOut.exitCode, 0, jsonOut.stderr || jsonOut.stdout);
  const parsed = JSON.parse(jsonOut.stdout);
  assert.equal(parsed.context, undefined);
  assert.equal(parsed.latestSeq, 2);
  assert.equal(parsed.lastSeenSeq, 1);
  assert.equal(parsed.deltas.length, 1);
  assert.equal(parsed.deltas[0].targetFile, 'observations.md');

  // Daemon-specific context endpoints expose the same compact hook context and
  // structured deltas for IDE hooks/dashboard callers.
  const hookContext = await apiGet(`/workspaces/${parsed.workspaceId}/context/hook?sinceSeq=1&deltasOnly=true`, ctx);
  assert.equal(hookContext.response.status, 200);
  assert.equal(hookContext.body.ok, true);
  assert.equal(hookContext.body.data.context, undefined);
  assert.equal(hookContext.body.data.latestSeq, 2);
  assert.equal(hookContext.body.data.deltas[0].targetFile, 'observations.md');

  const daemonDeltas = await apiGet(`/workspaces/${parsed.workspaceId}/context/deltas?sinceSeq=0&limit=1`, ctx);
  assert.equal(daemonDeltas.response.status, 200);
  assert.equal(daemonDeltas.body.ok, true);
  assert.equal(daemonDeltas.body.data.deltas.length, 1);
  assert.equal(daemonDeltas.body.data.deltas[0].seq, 2);

  // --- Claude Code hook auto-injection (`teambridge hook`) ---
  const settingsFile = join(worktree, '.claude', 'settings.json');

  const statusBefore = runCli(['hook', 'status'], wt);
  assert.equal(statusBefore.exitCode, 0, statusBefore.stderr || statusBefore.stdout);
  assert.match(statusBefore.stdout, /SessionStart hook installed: no/);

  const install = runCli(['hook', 'install'], wt);
  assert.equal(install.exitCode, 0, install.stderr || install.stdout);
  assert.ok(existsSync(settingsFile), 'settings.json should exist after install');
  const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
  const commands = settings.hooks.SessionStart.flatMap((entry) => entry.hooks.map((h) => h.command));
  assert.ok(commands.some((c) => c.includes('teambridge context')), 'hook command should run `teambridge context`');

  // Install is idempotent — a second install does not add a duplicate entry.
  runCli(['hook', 'install'], wt);
  const afterSecond = JSON.parse(readFileSync(settingsFile, 'utf8'));
  assert.equal(afterSecond.hooks.SessionStart.length, 1);

  const statusAfter = runCli(['hook', 'status'], wt);
  assert.match(statusAfter.stdout, /SessionStart hook installed: yes/);

  const uninstall = runCli(['hook', 'uninstall'], wt);
  assert.equal(uninstall.exitCode, 0, uninstall.stderr || uninstall.stdout);
  const statusFinal = runCli(['hook', 'status'], wt);
  assert.match(statusFinal.stdout, /SessionStart hook installed: no/);
});
