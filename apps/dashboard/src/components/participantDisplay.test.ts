import { describe, expect, it } from 'vitest';
import { participantFirstName } from './participantDisplay';

describe('participantFirstName', () => {
  it('uses the first word of a full name', () => {
    expect(participantFirstName('Priya Chandrasekaran')).toBe('Priya');
    expect(participantFirstName('Ronish Patel')).toBe('Ronish');
  });

  it('strips slug suffixes for hyphenated display names', () => {
    expect(participantFirstName('ronish-patel')).toBe('Ronish');
    expect(participantFirstName('marcus-webb')).toBe('Marcus');
    expect(participantFirstName('flynn-o-brien')).toBe('Flynn');
  });
});
