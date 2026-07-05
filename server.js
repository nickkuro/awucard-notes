// server.js
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const crypto = require("crypto");
const path = require("path");
const store = require("./store");

const {
  DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI,
  SESSION_SECRET, ALLOWED_DISCORD_IDS, BOT_TOKEN, PORT
} = process.env;

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI || !SESSION_SECRET) {
  console.error("Missing required env vars.");
  process.exit(1);
}

const allowlist = (ALLOWED_DISCORD_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(session({
  store: new FileStore({
    path: path.join(__dirname, "data", "sessions"),
    ttl: 60 * 60 * 24 * 30,
    retries: 1,
    logFn: function() {}
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 24 * 30 }
}));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  next();
}

// ---------- Discord bot helpers ----------
const DISCORD_API = "https://discord.com/api/v10";

async function botFetch(path, opts = {}) {
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN not configured");
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...opts,
    headers: { "Authorization": `Bot ${BOT_TOKEN}`, "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord API error ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

async function getDMChannel(discordUserId) {
  return botFetch("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: discordUserId })
  });
}

function splitMessage(text, max = 1900) {
  if (text.length <= max) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > max) {
    let split = remaining.lastIndexOf("\n", max);
    if (split < max / 2) split = max;
    chunks.push(remaining.slice(0, split));
    remaining = remaining.slice(split).replace(/^\n+/, "");
  }
  if (remaining.trim()) chunks.push(remaining);
  return chunks;
}

async function sendDM(discordUserId, content) {
  const channel = await getDMChannel(discordUserId);
  const chunks = splitMessage(content);
  for (const chunk of chunks) {
    await botFetch(`/channels/${channel.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: chunk })
    });
  }
}

function formatNoteForDiscord(note, label = null) {
  let msg = label ? `${label}\n` : "";
  if (note.title) msg += `**${note.title}**\n`;
  if (note.body) msg += `\n${note.body}`;
  if (note.tags && note.tags.length) msg += `\n\n🏷️ ${note.tags.map((t) => `#${t}`).join(" ")}`;
  return msg.trim();
}

// ---------- Reminder job ----------
function startReminderJob() {
  setInterval(async () => {
    const due = store.getDueReminders();
    for (const reminder of due) {
      try {
        const user = store.getUser(reminder.ownerId);
        const note = store.getNote(reminder.ownerId, reminder.noteId);
        const title = note ? note.title : reminder.noteTitle;
        const body = note ? note.body : "(Note no longer exists)";
        const tags = note ? note.tags : [];
        const fakeNote = { title, body, tags };
        const content = formatNoteForDiscord(fakeNote, "⏰ **Reminder**");
        if (user) await sendDM(user.id, content);
      } catch (err) {
        console.error("Reminder DM failed:", err.message);
      }
      if (reminder.repeat && reminder.repeatInterval) {
        await store.rescheduleReminder(reminder.id, reminder.repeatInterval);
      } else {
        await store.deleteReminder(reminder.id);
      }
    }
  }, 30000);
}

// ---------- Discord OAuth2 ----------
app.get("/auth/discord", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID, redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code", scope: "identify", state, prompt: "consent"
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== req.session.oauthState) {
    return res.status(400).send("Login failed: invalid or expired state. Go back and try again.");
  }
  delete req.session.oauthState;
  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: DISCORD_REDIRECT_URI })
    });
    if (!tokenRes.ok) throw new Error("Token exchange failed");
    const tokenData = await tokenRes.json();
    const profileRes = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    if (!profileRes.ok) throw new Error("Could not fetch Discord profile");
    const profile = await profileRes.json();
    if (allowlist.length && !allowlist.includes(profile.id)) {
      return res.status(403).send("Your Discord account isn't on the guest list for this Ledger.");
    }
    const user = await store.upsertUser(profile);
    req.session.user = { id: user.id, username: user.username, avatar: user.avatar, timezone: user.timezone || "UTC" };
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Login failed. Check the server logs.");
  }
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  res.json(req.session.user);
});

app.put("/api/me/timezone", requireAuth, async (req, res) => {
  const { timezone } = req.body || {};
  if (!timezone) return res.status(400).json({ error: "timezone required" });
  const user = await store.updateUserTimezone(req.session.user.id, timezone);
  req.session.user.timezone = timezone;
  res.json(user);
});

// ---------- Characters ----------
app.get("/api/characters", requireAuth, (req, res) => res.json(store.listCharacters(req.session.user.id)));
app.post("/api/characters", requireAuth, async (req, res) => {
  const { name, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
  res.status(201).json(await store.createCharacter(req.session.user.id, { name: name.trim(), color }));
});
app.put("/api/characters/:id", requireAuth, async (req, res) => {
  const c = await store.updateCharacter(req.session.user.id, req.params.id, req.body || {});
  if (!c) return res.status(404).json({ error: "Not found" });
  res.json(c);
});
app.delete("/api/characters/:id", requireAuth, async (req, res) => {
  const ok = await store.deleteCharacter(req.session.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---------- Notes ----------
app.get("/api/notes", requireAuth, (req, res) => {
  res.json(store.listNotes(req.session.user.id, req.query.characterId || "__all__"));
});
app.post("/api/notes", requireAuth, async (req, res) => {
  res.status(201).json(await store.createNote(req.session.user.id, req.body || {}));
});
app.put("/api/notes/:id", requireAuth, async (req, res) => {
  const note = await store.updateNote(req.session.user.id, req.params.id, req.body || {});
  if (!note) return res.status(404).json({ error: "Not found" });
  res.json(note);
});
app.delete("/api/notes/:id", requireAuth, async (req, res) => {
  const ok = await store.deleteNote(req.session.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});
app.delete("/api/notes", requireAuth, async (req, res) => {
  await store.clearNotes(req.session.user.id, req.query.characterId || "__all__");
  res.json({ ok: true });
});

// ---------- Send note to DM ----------
app.post("/api/notes/:id/send-dm", requireAuth, async (req, res) => {
  if (!BOT_TOKEN) return res.status(503).json({ error: "Bot not configured — add BOT_TOKEN to your environment variables." });
  const note = store.getNote(req.session.user.id, req.params.id);
  if (!note) return res.status(404).json({ error: "Not found" });
  try {
    await sendDM(req.session.user.id, formatNoteForDiscord(note));
    res.json({ ok: true });
  } catch (err) {
    console.error("Send DM failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Reminders ----------
app.get("/api/reminders", requireAuth, (req, res) => {
  res.json(store.listReminders(req.session.user.id));
});
app.get("/api/notes/:id/reminders", requireAuth, (req, res) => {
  res.json(store.listRemindersForNote(req.session.user.id, req.params.id));
});
app.post("/api/reminders", requireAuth, async (req, res) => {
  if (!BOT_TOKEN) return res.status(503).json({ error: "Bot not configured — add BOT_TOKEN to your environment variables." });
  const { noteId, fireAt, repeat, repeatInterval, noteTitle } = req.body || {};
  if (!noteId || !fireAt) return res.status(400).json({ error: "noteId and fireAt required" });
  const reminder = await store.createReminder(req.session.user.id, { noteId, fireAt, repeat, repeatInterval, noteTitle });
  res.status(201).json(reminder);
});
app.delete("/api/reminders/:id", requireAuth, async (req, res) => {
  const ok = await store.deleteReminder(req.params.id);
  if (!ok) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.get("/healthz", (req, res) => res.send("ok"));
app.use(express.static(path.join(__dirname, "public")));

const port = PORT || 3000;
app.listen(port, () => {
  console.log(`Ledger running on http://localhost:${port}`);
  if (BOT_TOKEN) {
    startReminderJob();
    console.log("Reminder job started.");
  } else {
    console.log("No BOT_TOKEN — DM and reminder features disabled.");
  }
});
