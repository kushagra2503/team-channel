import { describe, expect, it } from 'vitest';
import { avatarNameSlug, avatarStorageId } from './avatar-identity';

describe('avatarNameSlug', () => {
  it('maps apostrophe names to the same slug as hyphenated participant ids', () => {
    expect(avatarNameSlug("Flynn O'Brien")).toBe('flynn-o-brien');
    expect(avatarNameSlug('flynn-o-brien')).toBe('flynn-o-brien');
  });

  it('keeps ordinary names stable', () => {
    expect(avatarNameSlug('Marcus Webb')).toBe('marcus-webb');
    expect(avatarNameSlug('marcus-webb')).toBe('marcus-webb');
  });

  it('uses url-safe storage ids', () => {
    expect(avatarStorageId("Flynn O'Brien")).toBe('name_flynn-o-brien');
  });
});
