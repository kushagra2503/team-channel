#!/usr/bin/env node
// Populate the local Teambridge daemon with realistic demo data for the dashboard.
// Talks to the daemon's own HTTP API so the SQLite state + vault files stay valid.
//
// Usage:
//   node scripts/seed-demo.mjs                 # seed against http://127.0.0.1:9473
//   TEAMBRIDGE_DAEMON_URL=http://127.0.0.1:9473 node scripts/seed-demo.mjs
//
// Safe to re-run: existing session names are skipped.

const { execFileSync } = await import('node:child_process');
const { rm } = await import('node:fs/promises');
const { join } = await import('node:path');

const DAEMON_URL = process.env.TEAMBRIDGE_DAEMON_URL ?? 'http://127.0.0.1:9473';
const RESET = process.argv.includes('--reset');

async function api(path, init = {}) {
  const response = await fetch(new URL(path, DAEMON_URL), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.data;
}

const AGENTS = ['cursor', 'claude-code', 'codex', 'ghost'];

// Keys are short ids used in SESSIONS below; `full` is the realistic display
// name sent to the daemon (the daemon slugifies it, the dashboard prettifies it).
const MEMBERS = {
  ronish: { full: 'Ronish Sharma', agent: 'cursor' },
  nihal: { full: 'Nihal Patel', agent: 'claude-code' },
  kushagra: { full: 'Kushagra Verma', agent: 'codex' },
  aanya: { full: 'Aanya Reddy', agent: 'ghost' },
  meera: { full: 'Meera Iyer', agent: 'cursor' },
  arjun: { full: 'Arjun Mehta', agent: 'claude-code' },
  sara: { full: 'Sara Kim', agent: 'codex' },
  leo: { full: 'Leo Martins', agent: 'ghost' }
};

function memberFull(key) {
  return MEMBERS[key]?.full ?? key;
}

const SESSIONS = [
  {
    name: 'checkout-flow',
    lead: 'aanya',
    members: ['nihal', 'meera', 'arjun'],
    notes: {
      'decisions.md': [
        'Stripe PaymentIntents over legacy Charges for 3DS support.',
        'Keep cart state in a server-side session, not localStorage.',
        'Shipping address collected before payment, not after.'
      ],
      'observations.md': [
        'Mobile checkout drop-off spikes at the address form (48%).',
        'Safari autofill sometimes double-submits the email step.'
      ],
      'blockers.md': [
        'Webhook signature verification fails for test mode on staging.',
        'Need tax rate endpoint from finance before wiring totals.'
      ],
      'test-results.md': [
        'E2E: happy-path Visa checkout passes on Chrome + Safari.',
        'Unit: coupon application edge cases (stacking) failing.'
      ],
      'attempts.md': [
        'Tried serverless function for webhook relay; cold starts too slow.',
        'Attempted inline iframe for card field; killed by CSP.'
      ]
    }
  },
  {
    name: 'search-revamp',
    lead: 'meera',
    members: ['kushagra', 'sara', 'leo'],
    notes: {
      'decisions.md': [
        'Move from Postgres ILIKE to Meilisearch for typo tolerance.',
        'Index product title, sku, and category tags; skip descriptions.',
        'Debounce client-side to 250ms, not 400ms.'
      ],
      'observations.md': [
        'P95 search latency dropped from 320ms to 90ms after switch.',
        'Zero-result queries are 12% of total; need synonyms map.'
      ],
      'blockers.md': [
        'Meilisearch sync job stalls on products with null category.',
        'Facet counts overflow when category has >1000 items.'
      ],
      'test-results.md': [
        'Load test: 200 rps search holds at 110ms P95.',
        'Integration: reindex-from-scratch completes in 38s for 50k docs.'
      ],
      'attempts.md': [
        'Tried Typesense first; sync adapter was brittle.',
        'Attempted in-postgres trigram index; ranking too rigid.'
      ]
    }
  },
  {
    name: 'mobile-onboarding',
    lead: 'arjun',
    members: ['aanya', 'leo', 'sara'],
    notes: {
      'decisions.md': [
        'Three-screen onboarding: value, permissions, profile.',
        'Request push permission only after the first value screen.',
        'Skip email verification for demo accounts in dev builds.'
      ],
      'observations.md': [
        'Onboarding completion up 18% after trimming to 3 screens.',
        'Android users skip the permissions explainer more often.'
      ],
      'blockers.md': [
        'iOS notification permission prompt fires twice on cold start.',
        'Profile avatar upload crops incorrectly on small devices.'
      ],
      'test-results.md': [
        'Snapshot tests pass for all 3 onboarding screens.',
        'Instrumentation: funnel events firing in correct order.'
      ],
      'attempts.md': [
        'Tried a single scrollable onboarding page; completion dropped.',
        'Attempted video on screen 1; load time hurt retention.'
      ]
    }
  },
  {
    name: 'infra-migrations',
    lead: 'kushagra',
    members: ['ronish', 'nihal', 'meera'],
    notes: {
      'decisions.md': [
        'Migrate monolith worker pool from BullMQ to Temporal.',
        'Run both queues in parallel for 2 weeks before cutover.',
        'Keep Postgres as the source of truth, Temporal for orchestration only.'
      ],
      'observations.md': [
        'Temporal workflows are easier to replay than BullMQ jobs.',
        'Worker memory footprint down 30% after migration.'
      ],
      'blockers.md': [
        'Temporal server needs a separate Redis for visibility store.',
        'Legacy retry policy is implicit; must be made explicit per workflow.'
      ],
      'test-results.md': [
        'Soak test: 1k workflows/hr for 6h, no stuck workflows.',
        'Migration parity test: 47/47 jobs produce identical side effects.'
      ],
      'attempts.md': [
        'Tried in-process task queue as interim; no durability.',
        'Attempted DBJob table; polling pressure too high.'
      ]
    }
  },
  {
    name: 'design-system-v2',
    lead: 'sara',
    members: ['aanya', 'arjun', 'leo'],
    notes: {
      'decisions.md': [
        'Adopt Base UI primitives, drop Radix for the dashboard.',
        'Token-driven theming via CSS variables, no Tailwind config colors.',
        'Sidebar pattern based on shadcn sidebar-16 block.'
      ],
      'observations.md': [
        'Component count cut by 22% after consolidating variants.',
        'Dark mode parity reached for all surface tokens.'
      ],
      'blockers.md': [
        'Tooltip portal stacking breaks inside Sheet on mobile.',
        'Need a story for nested sidebar collapse on narrow viewports.'
      ],
      'test-results.md': [
        'Visual regression baseline captured for 64 components.',
        'A11y audit: all interactive primitives pass keyboard + screen reader.'
      ],
      'attempts.md': [
        'Tried headless styling only; consistency suffered.',
        'Attempted custom sidebar; replaced with shadcn block for polish.'
      ]
    }
  },
  {
    name: 'analytics-pipeline',
    lead: 'leo',
    members: ['ronish', 'kushagra', 'meera'],
    notes: {
      'decisions.md': [
        'Stream events to Kafka, sink to ClickHouse for queries.',
        'Define a typed event catalog; no ad-hoc event names.',
        'Backfill only the last 30 days for the cutover.'
      ],
      'observations.md': [
        'ClickHouse query latency for daily active users: 40ms.',
        'Kafka consumer lag spikes during hourly batch backfills.'
      ],
      'blockers.md': [
        'PII redaction step not yet wired into the producer SDK.',
        'Schema registry rollout blocked on iOS SDK version bump.'
      ],
      'test-results.md': [
        'End-to-end: event lands in ClickHouse within 4s P95.',
        'Replay test: 1M historical events re-processed with no duplicates.'
      ],
      'attempts.md': [
        'Tried Postgres + Materialized views; refresh too slow.',
        'Attempted direct S3 sink; query story was poor.'
      ]
    }
  }
];

function pickAgent(key) {
  return MEMBERS[key]?.agent ?? AGENTS[key.length % AGENTS.length];
}

function repoRootPath() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function runSql(dbPath, sql) {
  execFileSync('sqlite3', [dbPath, sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function querySql(dbPath, sql) {
  const output = execFileSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  return output ? JSON.parse(output) : [];
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

// Weighted presence so the dashboard shows a realistic online/idle/offline mix.
const PRESENCE_POOL = ['active', 'active', 'active', 'active', 'idle', 'idle', 'offline'];

function randomizePresence(dbPath) {
  const workspaces = querySql(dbPath, 'select id from workspaces');
  let online = 0;
  let idle = 0;
  let offline = 0;

  for (const { id: workspaceId } of workspaces) {
    const participants = querySql(
      dbPath,
      `select id from participants where workspace_id = '${workspaceId}'`
    );
    if (participants.length === 0) {
      continue;
    }

    // Guarantee at least one offline member per multi-member session so the
    // Offline group is always visible in the demo.
    const forcedOfflineIndex =
      participants.length > 1 ? Math.floor(Math.random() * participants.length) : -1;

    participants.forEach(({ id }, index) => {
      const status =
        index === forcedOfflineIndex
          ? 'offline'
          : PRESENCE_POOL[Math.floor(Math.random() * PRESENCE_POOL.length)];
      const lastSeenAt =
        status === 'offline'
          ? isoDaysAgo(Math.floor(Math.random() * 6) + 1)
          : status === 'idle'
            ? isoHoursAgo(Math.floor(Math.random() * 3) + 1)
            : isoMinutesAgo(Math.floor(Math.random() * 10) + 1);

      runSql(
        dbPath,
        `update participants set status = '${status}', last_seen_at = '${lastSeenAt}' where id = '${id}';`
      );

      if (status === 'offline') offline += 1;
      else if (status === 'idle') idle += 1;
      else online += 1;
    });
  }

  console.log(`  presence: ${online} active, ${idle} idle, ${offline} offline`);
}

function resetDemoSessions(dbPath, repoRoot) {
  const sessions = SESSIONS.map((session) => session.name);
  const workspaces = querySql(
    dbPath,
    `select id, session_name from workspaces where session_name in (${sessions
      .map((name) => `'${name}'`)
      .join(', ')});`
  );

  for (const { id, session_name: sessionName } of workspaces) {
    runSql(dbPath, `delete from worktrees where workspace_id = '${id}';`);
    runSql(dbPath, `delete from local_sequences where workspace_id = '${id}';`);
    runSql(dbPath, `delete from participants where workspace_id = '${id}';`);
    runSql(dbPath, `delete from workspaces where id = '${id}';`);
    rm(join(repoRoot, '.teambridge', 'workspaces', sessionName), { recursive: true, force: true });
  }

  if (workspaces.length > 0) {
    console.log(`reset ${workspaces.length} demo session(s)`);
  }
}

async function ensureWorkspace(session) {
  const existing = await api('/workspaces');
  const match = existing.workspaces.find((workspace) => workspace.sessionName === session.name);
  if (match) {
    return { workspace: match, created: false };
  }

  const start = await api('/workspaces/start', {
    method: 'POST',
    body: JSON.stringify({
      sessionName: session.name,
      displayName: memberFull(session.lead),
      agent: pickAgent(session.lead),
      baseRef: 'HEAD'
    })
  });

  return { workspace: start.manifest, created: true };
}

async function addMembers(session, workspaceId) {
  const participantIds = [];
  for (const name of session.members) {
    const joined = await api('/workspaces/join', {
      method: 'POST',
      body: JSON.stringify({
        sessionName: session.name,
        displayName: memberFull(name),
        agent: pickAgent(name)
      })
    });
    participantIds.push({ name, id: joined.worktree.userId });
  }
  return participantIds;
}

async function publishNotes(session, workspaceId, actors) {
  const allActors = [{ name: session.lead, id: workspaceId }, ...actors];
  let seq = 0;
  for (const [file, lines] of Object.entries(session.notes)) {
    for (const text of lines) {
      const actor = allActors[seq % allActors.length];
      await api(`/workspaces/${encodeURIComponent(session.name)}/events`, {
        method: 'POST',
        body: JSON.stringify({
          targetFile: file,
          payload: { text },
          actorId: actor.id
        })
      });
      seq += 1;
    }
  }
}

async function main() {
  console.log(`seeding Teambridge daemon at ${DAEMON_URL}`);
  const repoRoot = repoRootPath();
  const dbPath = `${repoRoot}/.teambridge/state.sqlite`;

  if (RESET) {
    resetDemoSessions(dbPath, repoRoot);
  }

  for (const session of SESSIONS) {
    const { workspace, created } = await ensureWorkspace(session);
    console.log(`${created ? 'created' : 'exists '} session: ${session.name} (${workspace.id})`);

    if (created) {
      const members = await addMembers(session, workspace.id);
      console.log(`  added ${members.length} members: ${members.map((member) => memberFull(member.name)).join(', ')}`);
      await publishNotes(session, workspace.id, members);
      console.log(`  published vault notes`);
    }
  }

  randomizePresence(dbPath);

  console.log('seed complete');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
