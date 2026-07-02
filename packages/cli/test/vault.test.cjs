const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { mkdtempSync, realpathSync, rmSync, writeFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');

const daemonClient = require('../dist/daemon-client.js');
const { runVault } = require('../dist/commands/vault.js');

function git(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeTrackWorktree() {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tb-vault-')));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@local'], dir);
  git(['config', 'user.name', 'Test'], dir);
  writeFileSync(path.join(dir, 'README.md'), 'hi\n');
  git(['add', 'README.md'], dir);
  git(['commit', '-m', 'init'], dir);
  git(['checkout', '-b', 'teambridge/auth-redesign/kushagra'], dir);
  return dir;
}

function withTrackWorktree(fn) {
  return async () => {
    const dir = makeTrackWorktree();
    const originalCwd = process.cwd();
    const originalListTracks = daemonClient.listTracks;
    daemonClient.listTracks = async () => ({ ok: true, data: { tracks: [{ id: 'ws_1', sessionName: 'auth-redesign' }] } });
    try {
      process.chdir(dir);
      await fn({ repoRoot: dir, baseUrl: 'http://unused' });
    } finally {
      process.chdir(originalCwd);
      daemonClient.listTracks = originalListTracks;
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

function captureStdout() {
  const original = process.stdout.write.bind(process.stdout);
  let output = '';
  process.stdout.write = (chunk) => {
    output += chunk;
    return true;
  };
  return {
    restore: () => {
      process.stdout.write = original;
    },
    get output() {
      return output;
    }
  };
}

test(
  'vault read prints the file content for the current track',
  withTrackWorktree(async (options) => {
    const original = daemonClient.readVaultFile;
    daemonClient.readVaultFile = async (_options, workspaceId, filePath) => {
      assert.equal(workspaceId, 'ws_1');
      assert.equal(filePath, 'decisions.md');
      return { ok: true, data: { file: { path: filePath, content: '- Backend owns invoice state\n' } } };
    };
    const capture = captureStdout();
    try {
      await runVault(['read', 'decisions.md'], options);
      assert.equal(capture.output, '- Backend owns invoice state\n');
    } finally {
      capture.restore();
      daemonClient.readVaultFile = original;
    }
  })
);

test(
  'vault read passes through an invalid-path daemon error',
  withTrackWorktree(async (options) => {
    const original = daemonClient.readVaultFile;
    daemonClient.readVaultFile = async () => ({ ok: false, error: { code: 'INVALID_REQUEST', message: 'Unsupported Phase 1 vault file: notes.md' } });
    try {
      await assert.rejects(() => runVault(['read', 'notes.md'], options), /Unsupported Phase 1 vault file/);
    } finally {
      daemonClient.readVaultFile = original;
    }
  })
);

test(
  'vault context prints the concatenated context and a truncation summary to stderr',
  withTrackWorktree(async (options) => {
    const original = daemonClient.getVaultContext;
    daemonClient.getVaultContext = async () => ({
      ok: true,
      data: { context: { workspaceId: 'ws_1', content: 'hello', includedPaths: ['decisions.md'], truncated: false, lastSeq: 4 } }
    });
    const capture = captureStdout();
    try {
      await runVault(['context'], options);
      assert.equal(capture.output, 'hello');
    } finally {
      capture.restore();
      daemonClient.getVaultContext = original;
    }
  })
);

test(
  'vault search prints results as path:line: text',
  withTrackWorktree(async (options) => {
    const original = daemonClient.searchVault;
    daemonClient.searchVault = async (_options, workspaceId, query) => {
      assert.equal(workspaceId, 'ws_1');
      assert.equal(query, 'invoice state');
      return { ok: true, data: { results: [{ path: 'decisions.md', line: 2, text: '- Backend owns invoice state' }] } };
    };
    const capture = captureStdout();
    try {
      await runVault(['search', 'invoice', 'state'], options);
      assert.equal(capture.output, 'decisions.md:2: - Backend owns invoice state\n');
    } finally {
      capture.restore();
      daemonClient.searchVault = original;
    }
  })
);

test(
  'vault search reports no matches without erroring',
  withTrackWorktree(async (options) => {
    const original = daemonClient.searchVault;
    daemonClient.searchVault = async () => ({ ok: true, data: { results: [] } });
    const capture = captureStdout();
    try {
      await runVault(['search', 'nonexistent'], options);
      assert.equal(capture.output, 'No matches.\n');
    } finally {
      capture.restore();
      daemonClient.searchVault = original;
    }
  })
);

test(
  'vault context passes through a daemon error',
  withTrackWorktree(async (options) => {
    const original = daemonClient.getVaultContext;
    daemonClient.getVaultContext = async () => ({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'daemon unavailable' } });
    try {
      await assert.rejects(() => runVault(['context'], options), /daemon unavailable/);
    } finally {
      daemonClient.getVaultContext = original;
    }
  })
);

test(
  'vault rejects an unrecognized subcommand',
  withTrackWorktree(async (options) => {
    await assert.rejects(() => runVault(['bogus'], options), /Usage: teambridge vault read/);
  })
);
