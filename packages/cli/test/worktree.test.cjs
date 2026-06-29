const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

const naming = require('../dist/lib/naming.js');
const { prepareJoinerWorktree } = require('../dist/lib/worktree.js');

test('safeDisplayName matches the daemon rules byte-for-byte', () => {
  assert.equal(naming.safeDisplayName('Kush.ra'), 'kush.ra');
  assert.equal(naming.safeDisplayName('Alice!'), 'alice');
  assert.equal(naming.safeDisplayName('  --Bob--  '), 'bob');
  assert.equal(naming.safeDisplayName('a b c'), 'a-b-c');
  assert.equal(naming.safeDisplayName(''), 'local');
  assert.equal(naming.safeDisplayName('***'), 'local');
});

test('branchForParticipant uses the raw session name + safe display name', () => {
  assert.equal(naming.branchForParticipant('billing-refactor', 'Kushagra'), 'teambridge/billing-refactor/kushagra');
});

test('assertValidSessionName rejects unsafe names and accepts good ones', () => {
  assert.throws(() => naming.assertValidSessionName('has space'));
  assert.throws(() => naming.assertValidSessionName('../evil'));
  assert.throws(() => naming.assertValidSessionName('a/b'));
  assert.doesNotThrow(() => naming.assertValidSessionName('auth-redesign'));
  assert.doesNotThrow(() => naming.assertValidSessionName('billing.v2_1'));
});

function fakeGit(handlers) {
  return {
    calls: [],
    run(args) {
      this.calls.push(args);
      for (const handler of handlers) {
        if (handler.match(args)) {
          return handler.result;
        }
      }
      return { stdout: '', stderr: '', status: 0 };
    }
  };
}

const OK = { stdout: '', stderr: '', status: 0 };
const FAIL = { stdout: '', stderr: '', status: 1 };

test('prepareJoinerWorktree creates a new branch worktree on the happy path', () => {
  const repoRoot = path.join(os.tmpdir(), 'tb-wt-happy-does-not-exist');
  const git = fakeGit([
    { match: (a) => a[0] === 'check-ignore', result: OK }, // .teambridge ignored
    { match: (a) => a[0] === 'worktree' && a[1] === 'list', result: OK }, // none registered
    { match: (a) => a[0] === 'rev-parse', result: OK }, // base commit present
    { match: (a) => a[0] === 'show-ref', result: FAIL }, // branch does not exist
    { match: (a) => a[0] === 'worktree' && a[1] === 'add', result: OK }
  ]);

  const result = prepareJoinerWorktree(
    { repoRoot, sessionName: 'auth', displayName: 'Kushagra', baseCommit: 'abc123' },
    git
  );

  assert.equal(result.created, true);
  assert.equal(result.reused, false);
  assert.equal(result.branch, 'teambridge/auth/kushagra');
  const addCall = git.calls.find((a) => a[0] === 'worktree' && a[1] === 'add');
  assert.ok(addCall, 'expected git worktree add to be called');
  assert.ok(addCall.includes('-b'), 'expected a new branch to be created');
  assert.ok(addCall.includes('abc123'), 'expected the worktree to be cut from the base commit');
});

test('prepareJoinerWorktree fails clearly when the base commit is missing locally', () => {
  const repoRoot = path.join(os.tmpdir(), 'tb-wt-missing-base');
  const git = fakeGit([
    { match: (a) => a[0] === 'check-ignore', result: OK },
    { match: (a) => a[0] === 'worktree' && a[1] === 'list', result: OK },
    { match: (a) => a[0] === 'rev-parse', result: FAIL } // base commit absent
  ]);

  assert.throws(
    () => prepareJoinerWorktree({ repoRoot, sessionName: 'auth', displayName: 'k', baseCommit: 'deadbeef' }, git),
    /not present locally/
  );
  assert.ok(!git.calls.some((a) => a[0] === 'worktree' && a[1] === 'add'), 'must not create a worktree without the base');
});

test('prepareJoinerWorktree is idempotent: reuses an already-registered worktree', () => {
  const repoRoot = path.join(os.tmpdir(), 'tb-wt-reuse');
  const expectedPath = naming.worktreePathFor(repoRoot, 'auth', 'Kushagra');
  const porcelain = `worktree ${expectedPath}\nHEAD abc123\nbranch refs/heads/teambridge/auth/kushagra\n`;
  const git = fakeGit([
    { match: (a) => a[0] === 'check-ignore', result: OK },
    { match: (a) => a[0] === 'worktree' && a[1] === 'list', result: { stdout: porcelain, stderr: '', status: 0 } }
  ]);

  const result = prepareJoinerWorktree(
    { repoRoot, sessionName: 'auth', displayName: 'Kushagra', baseCommit: 'abc123' },
    git
  );

  assert.equal(result.reused, true);
  assert.equal(result.created, false);
  assert.ok(!git.calls.some((a) => a[0] === 'worktree' && a[1] === 'add'), 'must not re-add an existing worktree');
});

test('prepareJoinerWorktree refuses when the branch is checked out elsewhere', () => {
  const repoRoot = path.join(os.tmpdir(), 'tb-wt-branch-elsewhere');
  const porcelain = `worktree /some/other/path\nHEAD abc123\nbranch refs/heads/teambridge/auth/kushagra\n`;
  const git = fakeGit([
    { match: (a) => a[0] === 'check-ignore', result: OK },
    { match: (a) => a[0] === 'worktree' && a[1] === 'list', result: { stdout: porcelain, stderr: '', status: 0 } }
  ]);

  assert.throws(
    () => prepareJoinerWorktree({ repoRoot, sessionName: 'auth', displayName: 'Kushagra', baseCommit: 'abc123' }, git),
    /already checked out/
  );
});
