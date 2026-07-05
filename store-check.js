const assert = require('node:assert/strict');
const store = require('./store');

async function runStoreCheck() {
  const ownerId = `store-check-${Date.now()}`;
  const characterA = await store.createCharacter(ownerId, { name: 'Alpha', color: '#e8a33d' });
  const characterB = await store.createCharacter(ownerId, { name: 'Beta', color: '#4fa8a0' });

  const note = await store.createNote(ownerId, {
    title: 'Pinned reminder',
    body: 'Visible everywhere',
    tags: ['shared'],
    characterId: characterA.id
  });

  const updated = await store.updateNote(ownerId, note.id, { sticky: true });
  assert.equal(updated.sticky, true);

  const visibleNotes = await store.listNotes(ownerId, characterB.id);
  const found = visibleNotes.find((item) => item.id === note.id);
  assert.ok(found, 'sticky note should be visible when viewing a different character');

  await store.deleteNote(ownerId, note.id);
  await store.deleteCharacter(ownerId, characterA.id);
  await store.deleteCharacter(ownerId, characterB.id);

  console.log('Store check passed.');
}

runStoreCheck().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
