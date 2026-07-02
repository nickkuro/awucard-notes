// store.js
// Minimal JSON-file data store. No native dependencies, so it runs anywhere
// Node runs, with no separate database to install. Fine for a small group
// of Discord users. If this ever needs to scale past that, swap this file
// for a real database (Postgres, etc.) without touching server.js much,
// since everything goes through the functions exported below.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

let cache = null;
let writeQueue = Promise.resolve();

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {}, notes: {} }, null, 2));
  }
}

function load() {
  if (cache) return cache;
  ensureFile();
  cache = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (!cache.users) cache.users = {};
  if (!cache.notes) cache.notes = {};
  return cache;
}

function persist() {
  const data = cache;
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve, reject) => {
        fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), (err) => {
          if (err) reject(err);
          else resolve();
        });
      })
  );
  return writeQueue;
}

function upsertUser(discordUser) {
  const db = load();
  db.users[discordUser.id] = {
    id: discordUser.id,
    username: discordUser.username,
    avatar: discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null,
    updatedAt: Date.now()
  };
  return persist().then(() => db.users[discordUser.id]);
}

function getUser(id) {
  const db = load();
  return db.users[id] || null;
}

function listNotes(ownerId) {
  const db = load();
  return Object.values(db.notes).filter((n) => n.ownerId === ownerId);
}

function getNote(ownerId, id) {
  const db = load();
  const note = db.notes[id];
  if (!note || note.ownerId !== ownerId) return null;
  return note;
}

function createNote(ownerId, partial) {
  const db = load();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = Date.now();
  const note = {
    id,
    ownerId,
    title: partial.title || "",
    body: partial.body || "",
    tags: Array.isArray(partial.tags) ? partial.tags : [],
    createdAt: now,
    updatedAt: now
  };
  db.notes[id] = note;
  return persist().then(() => note);
}

function updateNote(ownerId, id, partial) {
  const db = load();
  const note = db.notes[id];
  if (!note || note.ownerId !== ownerId) return Promise.resolve(null);
  if (typeof partial.title === "string") note.title = partial.title;
  if (typeof partial.body === "string") note.body = partial.body;
  if (Array.isArray(partial.tags)) note.tags = partial.tags;
  note.updatedAt = Date.now();
  return persist().then(() => note);
}

function deleteNote(ownerId, id) {
  const db = load();
  const note = db.notes[id];
  if (!note || note.ownerId !== ownerId) return Promise.resolve(false);
  delete db.notes[id];
  return persist().then(() => true);
}

function clearNotes(ownerId) {
  const db = load();
  Object.keys(db.notes).forEach((id) => {
    if (db.notes[id].ownerId === ownerId) delete db.notes[id];
  });
  return persist();
}

module.exports = {
  upsertUser,
  getUser,
  listNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  clearNotes
};
