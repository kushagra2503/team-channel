const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDisplayName, avatarNameSlug } = require('@coord/core');

test('display name formatting matches dashboard avatar slug', () => {
  const displayName = formatDisplayName('Ronish', "O'Brien");
  assert.equal(displayName, "Ronish O'Brien");
  assert.equal(avatarNameSlug(displayName), 'ronish-o-brien');
});
