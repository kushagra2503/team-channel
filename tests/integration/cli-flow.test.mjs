import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apiGet,
  createTempGitRepo,
  parseCreatedProjectId,
  parseStartedWorkspaceId,
  pathsEqual,
  removeTempDir,
  runCli,
  startTestDaemon
} from './helpers.mjs';

test('CLI init → project create → start → status against a live daemon', async (t) => {
  const repoRoot = await createTempGitRepo();
  t.after(async () => {
    await removeTempDir(repoRoot);
  });

  const daemon = await startTestDaemon(repoRoot);
  t.after(async () => {
    await daemon.stop();
  });

  const init = runCli(['init', '--first-name', 'Ada', '--last-name', 'Lovelace', '--agent', 'cursor'], {
    repoRoot,
    baseUrl: daemon.baseUrl
  });
  assert.equal(init.exitCode, 0, init.stderr || init.stdout);
  assert.match(init.stdout, /Initialized Teambridge for Ada Lovelace/);

  const profileAfterInit = await apiGet('/user/profile', { repoRoot, baseUrl: daemon.baseUrl });
  assert.equal(profileAfterInit.response.status, 200);
  assert.equal(profileAfterInit.body.data.profile.displayName, 'Ada Lovelace');
  assert.equal(profileAfterInit.body.data.profile.firstName, 'Ada');

  const avatarUrl = new URL('/avatars/by-name/ada-lovelace', daemon.baseUrl);
  avatarUrl.searchParams.set('repoRoot', repoRoot);
  const avatarResponse = await fetch(avatarUrl);
  assert.equal(avatarResponse.status, 200);
  assert.match(avatarResponse.headers.get('content-type') ?? '', /^image\//);

  const initAgain = runCli(['init', '--first-name', 'Ignored', '--last-name', 'User'], {
    repoRoot,
    baseUrl: daemon.baseUrl
  });
  assert.equal(initAgain.exitCode, 0, initAgain.stderr || initAgain.stdout);
  assert.match(initAgain.stdout, /already initialized for Ada Lovelace/);

  const create = runCli(
    ['project', 'create', '--name', 'Integration App', '--description', 'CLI integration fixture'],
    { repoRoot, baseUrl: daemon.baseUrl }
  );
  assert.equal(create.exitCode, 0, create.stderr || create.stdout);
  assert.match(create.stdout, /Created project "Integration App"/);
  const projectId = parseCreatedProjectId(create.stdout);

  const profileAfterCreate = await apiGet('/user/profile', { repoRoot, baseUrl: daemon.baseUrl });
  assert.equal(profileAfterCreate.body.data.profile.defaultProjectId, projectId);

  const projectMembers = await apiGet(`/projects/${projectId}/members`, { repoRoot, baseUrl: daemon.baseUrl });
  assert.equal(projectMembers.response.status, 200);
  assert.equal(projectMembers.body.data.localUser?.displayName, 'Ada Lovelace');
  assert.ok(typeof projectMembers.body.data.localAvatarVersion === 'string');

  const list = runCli(['project', 'list'], { repoRoot, baseUrl: daemon.baseUrl });
  assert.equal(list.exitCode, 0, list.stderr || list.stdout);
  assert.match(list.stdout, new RegExp(`${projectId}\\s+Integration App`));

  const track = runCli(['start', 'billing-refactor', 'HEAD', '--project', projectId], {
    repoRoot,
    baseUrl: daemon.baseUrl
  });
  assert.equal(track.exitCode, 0, track.stderr || track.stdout);
  assert.match(track.stdout, /Started session "billing-refactor"/);
  const workspaceId = parseStartedWorkspaceId(track.stdout);

  const status = runCli(['status'], { repoRoot, baseUrl: daemon.baseUrl });
  assert.equal(status.exitCode, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /You: Ada Lovelace/);
  assert.match(status.stdout, /Integration App \(proj_/);
  assert.match(status.stdout, new RegExp(`Default project: ${projectId}`));
  assert.match(status.stdout, /billing-refactor → proj_/);

  const projectTracks = await apiGet(`/projects/${projectId}/tracks`, {
    repoRoot,
    baseUrl: daemon.baseUrl
  });
  assert.equal(projectTracks.response.status, 200);
  assert.equal(projectTracks.body.data.tracks.length, 1);
  assert.equal(projectTracks.body.data.tracks[0].id, workspaceId);
  assert.equal(projectTracks.body.data.tracks[0].projectId, projectId);

  const repoContext = await apiGet('/repo/context', { repoRoot, baseUrl: daemon.baseUrl });
  assert.equal(repoContext.response.status, 200);
  assert.equal(repoContext.body.ok, true);
  assert.equal(repoContext.body.data.context.branch, 'main');
  assert.ok(pathsEqual(repoContext.body.data.context.localPath, repoRoot));

  const scopedContext = await apiGet(`/repo/context?workspaceId=${encodeURIComponent(workspaceId)}`, {
    repoRoot,
    baseUrl: daemon.baseUrl
  });
  assert.equal(scopedContext.response.status, 200);
  assert.equal(scopedContext.body.ok, true);
  assert.equal(scopedContext.body.data.context.branch, 'teambridge/billing-refactor/ada-lovelace');
});

test('CLI start picks the only project when --project is omitted', async (t) => {
  const repoRoot = await createTempGitRepo();
  t.after(async () => {
    await removeTempDir(repoRoot);
  });

  const daemon = await startTestDaemon(repoRoot);
  t.after(async () => {
    await daemon.stop();
  });

  runCli(['init', '--first-name', 'Grace', '--last-name', 'Hopper'], { repoRoot, baseUrl: daemon.baseUrl });

  const create = runCli(['project', 'create', '--name', 'Solo Project'], {
    repoRoot,
    baseUrl: daemon.baseUrl
  });
  assert.equal(create.exitCode, 0, create.stderr || create.stdout);
  parseCreatedProjectId(create.stdout);

  const track = runCli(['start', 'solo-track'], { repoRoot, baseUrl: daemon.baseUrl });
  assert.equal(track.exitCode, 0, track.stderr || track.stdout);
  assert.match(track.stdout, /Started session "solo-track"/);

  const status = runCli(['status'], { repoRoot, baseUrl: daemon.baseUrl });
  assert.equal(status.exitCode, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /solo-track → proj_/);
});

test('CLI fails fast when daemon is unreachable', async (t) => {
  const repoRoot = await createTempGitRepo();
  t.after(async () => {
    await removeTempDir(repoRoot);
  });

  const status = runCli(['status'], {
    repoRoot,
    baseUrl: 'http://127.0.0.1:1'
  });
  assert.notEqual(status.exitCode, 0);
  assert.match(status.stderr + status.stdout, /fetch failed|ECONNREFUSED|teambridge:/i);
});
