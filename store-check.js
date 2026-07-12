const assert = require('node:assert/strict');
const store = require('./store');

async function checkNotesAndCharacters() {
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
  assert.strictEqual(typeof updated.sticky, 'boolean', 'sticky should round-trip as a real boolean, not 0/1');
  assert.ok(Array.isArray(updated.tags), 'tags should round-trip as a real array, not a JSON string');
  assert.deepEqual(updated.tags, ['shared']);

  const visibleNotes = await store.listNotes(ownerId, characterB.id);
  const found = visibleNotes.find((item) => item.id === note.id);
  assert.ok(found, 'sticky note should be visible when viewing a different character');

  await store.deleteNote(ownerId, note.id);
  await store.deleteCharacter(ownerId, characterA.id);
  await store.deleteCharacter(ownerId, characterB.id);
}

async function checkReminderOwnership() {
  const ownerA = `store-check-a-${Date.now()}`;
  const ownerB = `store-check-b-${Date.now()}`;

  const note = await store.createNote(ownerA, { title: 'Reminder target' });
  const reminder = await store.createReminder(ownerA, { noteId: note.id, fireAt: Date.now() + 60000 });

  const stolen = await store.deleteReminder(ownerB, reminder.id);
  assert.equal(stolen, false, 'a different owner must not be able to delete someone else\'s reminder');

  const stillThere = (await store.listReminders(ownerA)).find((r) => r.id === reminder.id);
  assert.ok(stillThere, 'reminder should still exist after a blocked cross-owner delete');

  const removed = await store.deleteReminder(ownerA, reminder.id);
  assert.equal(removed, true, 'the actual owner should be able to delete their own reminder');

  await store.deleteNote(ownerA, note.id);
}

async function checkBillOwnershipAndDueDateRollover() {
  const ownerA = `store-check-bills-a-${Date.now()}`;
  const ownerB = `store-check-bills-b-${Date.now()}`;

  const bill = await store.createBill(ownerA, {
    name: 'Rent', amount: 1200, currency: 'USD', dueDate: '2026-01-31', frequency: 'monthly'
  });

  assert.equal((await store.listBills(ownerB)).length, 0, 'another owner should not see this bill');
  assert.equal(await store.getBill(ownerB, bill.id), null, 'another owner should not be able to fetch this bill by id');
  assert.equal(await store.updateBill(ownerB, bill.id, { name: 'Hijacked' }), null, 'another owner should not be able to update this bill');
  assert.equal(await store.deleteBill(ownerB, bill.id), false, 'another owner should not be able to delete this bill');

  // Jan 31 + 1 month should land on Feb 28 (non-leap year), not overflow into March.
  const paid = await store.markBillPaid(ownerA, bill.id);
  assert.equal(paid.dueDate, '2026-02-28', 'monthly due date should clamp to the end of a shorter month, not roll into the next one');

  await store.deleteBill(ownerA, bill.id);
}

async function checkNotePreviousVersionRestore() {
  const ownerA = `store-check-restore-a-${Date.now()}`;
  const ownerB = `store-check-restore-b-${Date.now()}`;

  const note = await store.createNote(ownerA, { title: 'v1', body: 'body v1' });
  const fresh = await store.getNote(ownerA, note.id);
  assert.equal(fresh.prevBody, null, 'a brand new note should have no previous version yet');

  await store.updateNote(ownerA, note.id, { title: 'v2', body: 'body v2' });
  const afterAccidentalPaste = await store.updateNote(ownerA, note.id, { title: 'v3', body: 'PASTED OVER' });
  assert.equal(afterAccidentalPaste.prevBody, 'body v2', 'previous version should be the content right before the last save');
  assert.equal(afterAccidentalPaste.prevTitle, 'v2');

  assert.equal(await store.restorePreviousVersion(ownerB, note.id), null, 'another owner must not be able to restore this note');

  const restored = await store.restorePreviousVersion(ownerA, note.id);
  assert.equal(restored.body, 'body v2', 'restore should bring back the version saved before the last one');
  assert.equal(restored.prevBody, 'PASTED OVER', 'restore itself should be undoable by swapping the pasted-over content into prev');

  const restoredAgain = await store.restorePreviousVersion(ownerA, note.id);
  assert.equal(restoredAgain.body, 'PASTED OVER', 'restoring twice should bring back the pasted-over content (undo the undo)');

  await store.deleteNote(ownerA, note.id);
}

async function checkAllowlistAndBillsAccess() {
  const id = `store-check-guest-${Date.now()}`;

  const entry = await store.addAllowlistEntry(id, 'Test guest');
  assert.ok((await store.listAllowlist()).some((e) => e.id === id), 'added allowlist entry should be listed');
  assert.equal(entry.label, 'Test guest');
  await store.removeAllowlistEntry(id);
  assert.ok(!(await store.listAllowlist()).some((e) => e.id === id), 'removed allowlist entry should no longer be listed');

  assert.equal(store.hasBillsAccess(id), false);
  await store.grantBillsAccess(id);
  assert.equal(store.hasBillsAccess(id), true);
  await store.revokeBillsAccess(id);
  assert.equal(store.hasBillsAccess(id), false);
}

async function runStoreCheck() {
  await checkNotesAndCharacters();
  await checkReminderOwnership();
  await checkNotePreviousVersionRestore();
  await checkBillOwnershipAndDueDateRollover();
  await checkAllowlistAndBillsAccess();
  console.log('Store check passed.');
}

runStoreCheck().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
