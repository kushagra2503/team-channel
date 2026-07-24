#!/usr/bin/env node
// Populate the local Coord daemon with 3 realistic demo projects.
// Talks to the daemon's HTTP API + sqlite3 CLI for project/member tables.
//
// Usage:
//   node scripts/seed-demo.mjs              # seed against http://127.0.0.1:9473
//   node scripts/seed-demo.mjs --reset      # wipe + reseed
//   COORD_DAEMON_URL=http://127.0.0.1:9473 node scripts/seed-demo.mjs

const { execFileSync } = await import('node:child_process');
const { rm, mkdir, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');

const DAEMON_URL = process.env.COORD_DAEMON_URL ?? 'http://127.0.0.1:9473';
const RESET = process.argv.includes('--reset');

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function api(path, init = {}) {
  const response = await fetch(new URL(path, DAEMON_URL), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.data;
}

// ---------------------------------------------------------------------------
// SQLite helpers
// ---------------------------------------------------------------------------
function runSql(dbPath, sql) {
  execFileSync('sqlite3', [dbPath, sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function querySql(dbPath, sql) {
  const out = execFileSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  return out ? JSON.parse(out) : [];
}

function sq(val) {
  if (val === null || val === undefined) return 'null';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function repoRootPath() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
function isoHoursAgo(h) {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}
function isoMinutesAgo(m) {
  return new Date(Date.now() - m * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// Demo data — 3 completely different projects
// ---------------------------------------------------------------------------

/*
  Project 1: Beacon — Real-time analytics platform
  Project 2: Silo — Headless CMS
  Project 3: Forge — Internal developer tooling
*/

const PROJECTS = [
  {
    id: 'proj_beacon',
    name: 'Beacon',
    description: 'Real-time event analytics and monitoring platform for production systems.',
    status: 'active',
    members: [
      { id: 'pm_priya',   displayName: 'Priya Chandrasekaran', status: 'active' },
      { id: 'pm_marcus',  displayName: 'Marcus Webb',          status: 'active' },
      { id: 'pm_yuki',    displayName: 'Yuki Tanaka',          status: 'idle' },
      { id: 'pm_isobel',  displayName: 'Isobel Ferreira',      status: 'offline' },
      { id: 'pm_dev',     displayName: 'Dev Khanna',           status: 'active' },
      { id: 'pm_tariq',   displayName: 'Tariq Osei',           status: 'idle' }
    ],
    tracks: [
      {
        name: 'data-ingestion',
        lead: 'Priya Chandrasekaran',
        leadAgent: 'cursor',
        members: [
          { displayName: 'Marcus Webb',   agent: 'claude-code' },
          { displayName: 'Dev Khanna',    agent: 'codex' }
        ],
        notes: {
          'decisions.md': [
            'Use Kafka for event ingestion; Kinesis too expensive at our volume.',
            'Normalize all timestamps to UTC at the producer SDK level.',
            'Batch writes to ClickHouse in 5s windows with at-least-once delivery.',
            'Schema validation happens at the edge before Kafka publish.'
          ],
          'observations.md': [
            'Producer SDK adds ~2ms latency per event on p99.',
            'ClickHouse insert rate peaks at 400k rows/sec on 4-node cluster.',
            'Schema drift on iOS SDK caused 3% event loss last week.'
          ],
          'blockers.md': [
            'PII redactor not yet wired into the producer before Kafka publish.',
            'Kafka broker SSL certs expire in 18 days — renewal ticket open.'
          ],
          'attempts.md': [
            'Tried direct ClickHouse inserts from SDK — batching issues at scale.',
            'Evaluated Kinesis Firehose; per-shard cost made it unfeasible.'
          ]
        }
      },
      {
        name: 'query-engine',
        lead: 'Yuki Tanaka',
        leadAgent: 'claude-code',
        members: [
          { displayName: 'Priya Chandrasekaran', agent: 'cursor' },
          { displayName: 'Isobel Ferreira',      agent: 'ghost' }
        ],
        notes: {
          'decisions.md': [
            'Expose a SQL-like query DSL compiled to ClickHouse SQL.',
            'Cache materialized query results with a 60s TTL in Redis.',
            'Rate-limit per-tenant at 50 QPS with token bucket.'
          ],
          'observations.md': [
            'Time-series aggregation over 30d window: 140ms P95.',
            'Fanout queries for multi-tenant dashboards hit Redis hot key issue.'
          ],
          'blockers.md': [
            'Tenant isolation not enforced in the query planner — security gap.',
            'Redis cluster running at 78% memory; need eviction policy review.'
          ],
          'attempts.md': [
            'Tried Presto as query layer; operational complexity too high.',
            'Attempted in-memory result cache; eviction unpredictable under load.'
          ]
        }
      },
      {
        name: 'alerting-rules',
        lead: 'Tariq Osei',
        leadAgent: 'codex',
        members: [
          { displayName: 'Marcus Webb', agent: 'claude-code' },
          { displayName: 'Dev Khanna',  agent: 'cursor' }
        ],
        notes: {
          'decisions.md': [
            'Alert conditions expressed as threshold + duration + aggregation.',
            'Evaluate rules every 30s using a sliding window worker.',
            'Notification channels: PagerDuty, Slack, and email via SendGrid.'
          ],
          'observations.md': [
            'False-positive rate drops by 60% with 2-of-3 evaluation window.',
            'PagerDuty integration latency averages 800ms from rule fire to page.'
          ],
          'blockers.md': [
            'Alert deduplication window not accounting for clock skew between workers.',
            'Slack webhook rate limit being hit during incident storm scenarios.'
          ],
          'attempts.md': [
            'Evaluated Prometheus AlertManager; coupling to infra stack too tight.',
            'Tried cron-based evaluator; missed sub-minute spikes.'
          ]
        }
      },
      {
        name: 'dashboard-redesign',
        lead: 'Isobel Ferreira',
        leadAgent: 'ghost',
        members: [
          { displayName: 'Yuki Tanaka', agent: 'claude-code' },
          { displayName: 'Tariq Osei',  agent: 'codex' }
        ],
        notes: {
          'decisions.md': [
            'Widget-based layout with drag-and-drop using dnd-kit.',
            'Persist layout config per-user in Postgres, not localStorage.',
            'Chart library: Recharts for familiarity; consider Observable Plot next cycle.'
          ],
          'observations.md': [
            'Users spend 70% of session time on the "Funnel" widget.',
            'Table widgets load 2s slower than charts due to missing pagination.'
          ],
          'blockers.md': [
            'Widget resize handle conflicts with chart zoom on touch devices.',
            'Snapshot export to PDF breaks on dashboards with >12 widgets.'
          ],
          'attempts.md': [
            'Tried gridstack.js for layout; accessibility issues made us switch.',
            'Attempted server-side PDF render; puppeteer timeout on large boards.'
          ]
        }
      }
    ]
  },
  {
    id: 'proj_silo',
    name: 'Silo',
    description: 'Headless CMS with structured content modeling and a GraphQL delivery API.',
    status: 'active',
    members: [
      { id: 'pm_nadia',  displayName: 'Nadia Volkova',    status: 'active' },
      { id: 'pm_flynn',  displayName: 'Flynn O\'Brien',   status: 'active' },
      { id: 'pm_amara',  displayName: 'Amara Diallo',     status: 'offline' },
      { id: 'pm_soren',  displayName: 'Soren Lindqvist',  status: 'idle' },
      { id: 'pm_luz',    displayName: 'Luz Vega',         status: 'active' }
    ],
    tracks: [
      {
        name: 'auth-provider-swap',
        lead: 'Nadia Volkova',
        leadAgent: 'cursor',
        members: [
          { displayName: 'Flynn O\'Brien', agent: 'claude-code' },
          { displayName: 'Soren Lindqvist', agent: 'ghost' }
        ],
        notes: {
          'decisions.md': [
            'Replace custom JWT auth with Auth0 for SSO and MFA support.',
            'Migrate sessions using a dual-write period of 30 days.',
            'Scope tokens to tenant + role; no wildcard permissions.'
          ],
          'observations.md': [
            'Auth0 token refresh adds 40ms on cold sessions vs 5ms before.',
            '8% of users have duplicate accounts from the old email+password system.'
          ],
          'blockers.md': [
            'Auth0 M2M token quota being exceeded in staging after load tests.',
            'Tenant mapping for legacy SSO customers not yet documented.'
          ],
          'attempts.md': [
            'Evaluated Clerk; pricing didn\'t work at our user volume.',
            'Tried in-house SAML provider; maintenance burden too high.'
          ]
        }
      },
      {
        name: 'rich-text-editor',
        lead: 'Amara Diallo',
        leadAgent: 'codex',
        members: [
          { displayName: 'Luz Vega',      agent: 'cursor' },
          { displayName: 'Nadia Volkova', agent: 'claude-code' }
        ],
        notes: {
          'decisions.md': [
            'Migrate from Slate.js to TipTap; better extension ecosystem.',
            'Store document AST in Postgres JSONB, not raw HTML.',
            'Collaborative editing via Yjs CRDT synced over WebSocket.'
          ],
          'observations.md': [
            'TipTap cursor position sync latency: <100ms P95 in 2-user sessions.',
            'Conflict resolution on concurrent list edits occasionally drops text.'
          ],
          'blockers.md': [
            'Yjs persistence adapter for Postgres still in beta; data loss risk.',
            'Image paste from clipboard broken in Firefox 128.'
          ],
          'attempts.md': [
            'Tried ProseMirror directly; too low-level for our timeline.',
            'Evaluated Quill; collaboration model didn\'t fit our AST storage approach.'
          ]
        }
      },
      {
        name: 'media-cdn-migration',
        lead: 'Soren Lindqvist',
        leadAgent: 'ghost',
        members: [
          { displayName: 'Amara Diallo', agent: 'codex' },
          { displayName: 'Flynn O\'Brien', agent: 'claude-code' }
        ],
        notes: {
          'decisions.md': [
            'Move asset storage from S3 + CloudFront to Cloudflare R2 + Images.',
            'On-the-fly image transforms via Cloudflare Images API.',
            'Retain S3 URLs for 90 days with 302 redirects during cutover.'
          ],
          'observations.md': [
            'Cloudflare Images transform latency: 45ms vs 210ms with sharp lambda.',
            'R2 egress cost 0 vs $0.085/GB on CloudFront — 64% cost reduction.'
          ],
          'blockers.md': [
            'Existing signed S3 URLs embedded in published content won\'t auto-migrate.',
            'CORS policy for R2 bucket missing wildcard for editor preview domains.'
          ],
          'attempts.md': [
            'Tested imgix; pricing model didn\'t fit variable traffic spikes.',
            'Tried self-hosted Thumbor; ops overhead on Kubernetes too high.'
          ]
        }
      },
      {
        name: 'public-api-v2',
        lead: 'Flynn O\'Brien',
        leadAgent: 'claude-code',
        members: [
          { displayName: 'Luz Vega',        agent: 'cursor' },
          { displayName: 'Soren Lindqvist', agent: 'ghost' }
        ],
        notes: {
          'decisions.md': [
            'GraphQL over REST for v2; REST v1 maintained until end of year.',
            'Field-level permissions enforced at the resolver layer.',
            'Pagination via cursor-based model; offset pagination removed in v2.'
          ],
          'observations.md': [
            'GraphQL persisted queries cut average request size by 40%.',
            'N+1 query issue on nested content references requires DataLoader.'
          ],
          'blockers.md': [
            'DataLoader batching across async resolvers causes occasional stale reads.',
            'Deprecation notice tooling not yet emitting warnings in SDKs.'
          ],
          'attempts.md': [
            'Explored REST with HAL hypermedia; developer DX feedback was poor.',
            'Tried schema-first codegen; generated types drifted from runtime.'
          ]
        }
      }
    ]
  },
  {
    id: 'proj_forge',
    name: 'Forge',
    description: 'Internal developer platform: CI runner, secrets vault, and deployment tooling.',
    status: 'active',
    members: [
      { id: 'pm_theo',  displayName: 'Theo Nakamura',  status: 'active' },
      { id: 'pm_sana',  displayName: 'Sana Qureshi',   status: 'active' },
      { id: 'pm_ike',   displayName: 'Ike Adeyemi',    status: 'idle' },
      { id: 'pm_bex',   displayName: 'Bex Holloway',   status: 'offline' }
    ],
    tracks: [
      {
        name: 'cli-rewrite',
        lead: 'Theo Nakamura',
        leadAgent: 'cursor',
        members: [
          { displayName: 'Sana Qureshi', agent: 'claude-code' },
          { displayName: 'Ike Adeyemi',  agent: 'codex' }
        ],
        notes: {
          'decisions.md': [
            'Rewrite CLI in Go; drop the Node.js version for distribution simplicity.',
            'Single static binary per platform; no runtime dependencies.',
            'Config file at ~/.forge/config.toml, env vars override.'
          ],
          'observations.md': [
            'Go binary cold start: 18ms vs 480ms for Node CLI.',
            'Cross-compile matrix: darwin-arm64, darwin-amd64, linux-amd64, windows-amd64.'
          ],
          'blockers.md': [
            'cobra command tree conflicts with fish shell completion generator.',
            'Windows binary triggers SmartScreen due to unsigned executable.'
          ],
          'attempts.md': [
            'Tried Deno for a single-binary Node-like experience; module ecosystem gaps.',
            'Evaluated Rust; team Go expertise made it the clearer choice.'
          ]
        }
      },
      {
        name: 'secrets-vault',
        lead: 'Sana Qureshi',
        leadAgent: 'claude-code',
        members: [
          { displayName: 'Bex Holloway',  agent: 'ghost' },
          { displayName: 'Theo Nakamura', agent: 'cursor' }
        ],
        notes: {
          'decisions.md': [
            'Store secrets encrypted at rest with AES-256-GCM; key in KMS.',
            'Secrets scoped to project + environment; no global namespace.',
            'CLI injects secrets as env vars at process spawn, not written to disk.'
          ],
          'observations.md': [
            'KMS call overhead: 12ms per decrypt on average.',
            'Secret rotation in staging breaks 3 services still on old version.'
          ],
          'blockers.md': [
            'Secret audit log not yet capturing which CI run consumed which secret.',
            'KMS key policy needs review before production rollout.'
          ],
          'attempts.md': [
            'Evaluated Vault by HashiCorp; too heavy for our team size.',
            'Tried dotenv vault service; vendor lock-in risk for core infra.'
          ]
        }
      },
      {
        name: 'ci-pipeline-runner',
        lead: 'Ike Adeyemi',
        leadAgent: 'codex',
        members: [
          { displayName: 'Sana Qureshi',  agent: 'claude-code' },
          { displayName: 'Bex Holloway',  agent: 'ghost' }
        ],
        notes: {
          'decisions.md': [
            'Container-per-step runner using Docker SDK; no DIND.',
            'Pipeline definition in YAML with jsonschema validation at submit.',
            'Artifact storage in R2; retention policy 30 days for branches, 1 year for tags.'
          ],
          'observations.md': [
            'Step cold-start time averages 4.2s for Alpine-based images.',
            'Cache hit rate for node_modules layer: 88% across all pipelines.'
          ],
          'blockers.md': [
            'Parallel step orchestration deadlocks when DAG has a diamond dependency.',
            'Log streaming drops lines when container writes >64KB/s to stdout.'
          ],
          'attempts.md': [
            'Tried Buildkite agents; pricing and self-host complexity didn\'t fit.',
            'Evaluated Dagger; API maturity not there for our use case yet.'
          ]
        }
      }
    ]
  }
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PRESENCE_POOL = ['active', 'active', 'active', 'active', 'idle', 'idle', 'offline'];

function randomPresence() {
  return PRESENCE_POOL[Math.floor(Math.random() * PRESENCE_POOL.length)];
}

function presenceLastSeen(status) {
  if (status === 'offline') return isoDaysAgo(Math.floor(Math.random() * 7) + 1);
  if (status === 'idle') return isoHoursAgo(Math.floor(Math.random() * 4) + 1);
  return isoMinutesAgo(Math.floor(Math.random() * 12) + 1);
}

// ---------------------------------------------------------------------------
// Reset helpers
// ---------------------------------------------------------------------------
async function wipeAllDemoData(dbPath, repoRoot) {
  const allTrackNames = PROJECTS.flatMap((p) => p.tracks.map((t) => t.name));
  const allProjectIds = PROJECTS.map((p) => p.id);

  // Delete project members
  for (const id of allProjectIds) {
    runSql(dbPath, `delete from project_members where project_id = ${sq(id)};`);
  }

  // Delete projects
  for (const id of allProjectIds) {
    runSql(dbPath, `delete from projects where id = ${sq(id)};`);
  }

  // Delete tracks + related rows
  const inList = allTrackNames.map((n) => sq(n)).join(', ');
  if (inList.length === 0) return;

  const tracks = querySql(dbPath, `select id, session_name from tracks where session_name in (${inList})`);
  for (const { id, session_name: sessionName } of tracks) {
    runSql(dbPath, `delete from worktrees where workspace_id = ${sq(id)};`);
    runSql(dbPath, `delete from local_sequences where workspace_id = ${sq(id)};`);
    runSql(dbPath, `delete from participants where workspace_id = ${sq(id)};`);
    runSql(dbPath, `delete from tracks where id = ${sq(id)};`);
    await rm(join(repoRoot, '.coord', 'workspaces', sessionName), { recursive: true, force: true });
  }

  console.log(`wiped ${tracks.length} tracks and ${allProjectIds.length} projects`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\nseeding Coord daemon at ${DAEMON_URL}\n`);

  const repoRoot = repoRootPath();
  const dbPath = join(repoRoot, '.coord', 'state.sqlite');

  // Ensure daemon initialized the DB first
  await api('/workspaces');

  if (RESET) {
    await wipeAllDemoData(dbPath, repoRoot);
    console.log();
  }

  const now = new Date().toISOString();

  for (const project of PROJECTS) {
    console.log(`── ${project.name}`);

    // 1. Upsert project row
    const existingProject = querySql(dbPath, `select id from projects where id = ${sq(project.id)}`);
    if (existingProject.length === 0) {
      runSql(dbPath, `
        insert into projects (id, name, description, status, created_at)
        values (${sq(project.id)}, ${sq(project.name)}, ${sq(project.description)}, ${sq(project.status)}, ${sq(now)});
      `);
    }

    // 2. Upsert project members
    for (const member of project.members) {
      const existing = querySql(dbPath, `select id from project_members where id = ${sq(member.id)}`);
      if (existing.length === 0) {
        const lastSeenAt = presenceLastSeen(member.status);
        runSql(dbPath, `
          insert into project_members (id, project_id, display_name, status, last_seen_at)
          values (${sq(member.id)}, ${sq(project.id)}, ${sq(member.displayName)}, ${sq(member.status)}, ${sq(lastSeenAt)});
        `);
      }
    }
    console.log(`   ${project.members.length} members`);

    // 3. Create tracks
    for (const track of project.tracks) {
      const existing = querySql(dbPath, `select id from tracks where session_name = ${sq(track.name)}`);
      let trackId;

      if (existing.length > 0) {
        trackId = existing[0].id;
        console.log(`   exists  track: ${track.name}`);
        // Ensure project_id is set even on existing tracks
        runSql(dbPath, `update tracks set project_id = ${sq(project.id)} where id = ${sq(trackId)};`);
        continue;
      }

      // Create track via daemon API
      const started = await api('/workspaces/start', {
        method: 'POST',
        body: JSON.stringify({
          sessionName: track.name,
          displayName: track.lead,
          agent: track.leadAgent,
          baseRef: 'HEAD'
        })
      });
      trackId = started.manifest.id;

      // Set project_id on newly created track
      runSql(dbPath, `update tracks set project_id = ${sq(project.id)} where id = ${sq(trackId)};`);

      // Add members to track
      for (const member of track.members) {
        await api('/workspaces/join', {
          method: 'POST',
          body: JSON.stringify({
            sessionName: track.name,
            displayName: member.displayName,
            agent: member.agent
          })
        });
      }

      // Publish vault notes
      let seq = 0;
      const allParticipants = querySql(
        dbPath,
        `select id from participants where workspace_id = ${sq(trackId)} order by display_name`
      );
      for (const [file, lines] of Object.entries(track.notes)) {
        for (const text of lines) {
          const actorId = allParticipants[seq % allParticipants.length]?.id ?? trackId;
          await api(`/workspaces/${encodeURIComponent(track.name)}/events`, {
            method: 'POST',
            body: JSON.stringify({ targetFile: file, payload: { text }, actorId })
          });
          seq++;
        }
      }

      // Randomize participant presence (guarantee at least one offline)
      const participants = querySql(dbPath, `select id from participants where workspace_id = ${sq(trackId)}`);
      const forceOfflineIdx = participants.length > 1 ? Math.floor(Math.random() * participants.length) : -1;
      for (let i = 0; i < participants.length; i++) {
        const status = i === forceOfflineIdx ? 'offline' : randomPresence();
        const lastSeenAt = presenceLastSeen(status);
        runSql(dbPath, `update participants set status = ${sq(status)}, last_seen_at = ${sq(lastSeenAt)} where id = ${sq(participants[i].id)};`);
      }

      console.log(`   created track: ${track.name} (${participants.length + 1} participants, ${seq} notes)`);
    }

    console.log();
  }

  console.log('seed complete ✓\n');
  const totalProjects = PROJECTS.length;
  const totalTracks = PROJECTS.reduce((sum, p) => sum + p.tracks.length, 0);
  const totalMembers = PROJECTS.reduce((sum, p) => sum + p.members.length, 0);
  console.log(`  ${totalProjects} projects, ${totalTracks} tracks, ${totalMembers} project members`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
