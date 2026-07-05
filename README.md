# Ledger

Ledger is a private, Discord-backed notes app for characters, stories, and personal worldbuilding. It started as a simple note-taking tool and has grown into a small app with character organization, markdown notes, reminders, and Discord integrations.

The app is intentionally personal and private: each user signs in with Discord, gets their own notes space, and keeps data on the server rather than in the browser.

## What it can do now

- Discord login with a personal account space
- Character-based organization with colored character groups
- Notes with plain text or Markdown
- Auto-save and live markdown rendering
- Tags, search, and filtered note views
- Image embedding in notes
- Send a note directly to your own Discord DMs
- One-time and repeating reminders sent to Discord DMs
- Per-user timezone support for reminder display
- About + changelog modal
- Terms of Service and Privacy Policy pages
- Dark/light theme support

## Current status

Ledger is usable and actively being refined. The site is still getting polish, so expect small changes and occasional surprises while the app evolves.

## Quick start

### 1. Register a Discord application

1. Go to https://discord.com/developers/applications and create a new application.
2. Open OAuth2 in the sidebar and note the Client ID and Client Secret.
3. Under Redirects, add:
   - Local: `http://localhost:3000/auth/discord/callback`
   - Production: `https://your-domain.com/auth/discord/callback`

### 2. Configure the app

```bash
cp .env.example .env
```

Fill in the required values:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `SESSION_SECRET`

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Optional:

- `ALLOWED_DISCORD_IDS` for a guest list of approved Discord user IDs
- `BOT_TOKEN` if you want DM sending and reminders enabled
- `PORT` if you want a custom port

### 3. Install and run

```bash
npm install
npm start
```

Then visit `http://localhost:3000` and sign in with Discord.

## Deployment

Discord login needs a real HTTPS callback URL, so the app should be deployed somewhere with a stable domain. Good options include:

- Railway, Render, or Fly.io
- Docker / Portainer
- A VPS with nginx or Caddy

In production, make sure:

- `DISCORD_REDIRECT_URI` matches the deployed domain
- `NODE_ENV=production` is set
- the app is served over HTTPS

## Docker / Portainer

The repo includes a Dockerfile and docker-compose.yml for containerized deployment.

### Local Docker run

```bash
cp .env.example .env
docker compose up --build
```

### Portainer

1. Push the repo to GitHub or another Git host.
2. In Portainer, create a stack from the repository.
3. Add the same environment variables from `.env`.
4. Deploy the stack.

The container uses a persistent data volume so your notes survive container restarts and recreation.

## Project structure

- `server.js` — Express server, Discord OAuth flow, and API routes
- `store.js` — data storage logic for notes, characters, reminders, and users
- `public/index.html` — frontend UI and modal views
- `public/terms.html` and `public/privacy.html` — legal pages
- `Dockerfile` and `docker-compose.yml` — container setup

## Notes on data

Ledger currently stores data in a JSON-based store on the server. That is simple and practical for a small personal project, and it keeps the app easy to run and back up. If the project grows, the data layer can be swapped out without changing the rest of the app.

## Recent progress

The app now includes:

- a fuller note editor experience
- character-based note organization
- Discord DM sending
- reminders and timezone handling
- polished About / Changelog content
- basic legal pages for Terms and Privacy

If you want, the next step can be turning this into a more formal project roadmap or adding a changelog section for future releases.
