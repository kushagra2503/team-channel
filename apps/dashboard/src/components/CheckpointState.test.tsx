import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultCheckpoint } from '@teambridge/core';
import { CheckpointState, formatRelativeTime, truncateHash } from './CheckpointState';

const FIXED_NOW = new Date('2026-07-06T12:00:00.000Z').getTime();

function makeCheckpoint(overrides: Partial<VaultCheckpoint> = {}): VaultCheckpoint {
  return {
    id: 'ckpt_001',
    workspaceId: 'ws_123',
    seq: 42,
    storagePath: '/tmp/teambridge/.teambridge/checkpoints/ckpt_001.tar',
    hash: 'abcdef1234567890fedcba',
    createdByDeviceId: 'device_ronish',
    createdAt: '2026-07-06T11:00:00.000Z',
    ...overrides
  };
}

describe('CheckpointState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "No checkpoints yet" when latestCheckpoint is undefined', () => {
    render(<CheckpointState />);

    expect(screen.getByText('No checkpoints yet')).toBeTruthy();
    expect(
      screen.getByText('Checkpoints will appear here once the relay builds them')
    ).toBeTruthy();
  });

  it('renders checkpoint seq, relative created at, truncated hash, and device ID when present', () => {
    const checkpoint = makeCheckpoint();
    render(<CheckpointState latestCheckpoint={checkpoint} />);

    expect(screen.getByText(String(checkpoint.seq))).toBeTruthy();
    expect(screen.getByText(formatRelativeTime(checkpoint.createdAt, FIXED_NOW))).toBeTruthy();
    expect(screen.getByText(truncateHash(checkpoint.hash))).toBeTruthy();
    expect(screen.getByText(checkpoint.createdByDeviceId)).toBeTruthy();
  });

  it('renders gracefully when createdByDeviceId is empty', () => {
    const checkpoint = makeCheckpoint({ createdByDeviceId: '' });
    render(<CheckpointState latestCheckpoint={checkpoint} />);

    expect(screen.getByText('Unknown device')).toBeTruthy();
    expect(screen.getByText(String(checkpoint.seq))).toBeTruthy();
  });
});
