<?php
/* 
 * Configuration file - reads secrets from environment variables.
 * 
 * Set these environment variables (locally or in .env):
 *   DISCORD_EDITOR_IDS - comma-separated Discord IDs (e.g., "123,456,789")
 *   DISCORD_COMMENTOR_IDS - comma-separated Discord IDs (e.g., "123,456,789")
 *   DISCORD_CLIENT_ID - your Discord OAuth client ID
 *   DISCORD_CLIENT_SECRET - your Discord OAuth client secret
 *   DISCORD_REDIRECT_URI - your OAuth redirect URI
 */

// Load .env file if it exists (for local development)
if (file_exists(__DIR__ . "/.env")) {
    $env = parse_ini_file(__DIR__ . "/.env");
    foreach ($env as $key => $value) {
        if (!getenv($key)) {
            putenv("$key=$value");
        }
    }
}

/* Directory where note files are stored (must be writable) */
$DATA_DIR = __DIR__ . "/data";

/* Discord user IDs who can create and edit notes */
$editor_ids = getenv("DISCORD_EDITOR_IDS") ?: "";
$EDITORS = $editor_ids ? array_map('intval', explode(",", $editor_ids)) : [];

/* Discord user IDs who can comment on notes */
$commentor_ids = getenv("DISCORD_COMMENTOR_IDS") ?: "";
$COMMENTOR_DISCORD_IDS = $commentor_ids ? array_map('intval', explode(",", $commentor_ids)) : [];

/* Discord OAuth credentials (for auth.php) */
$DISCORD_CLIENT_ID = getenv("DISCORD_CLIENT_ID") ?: "";
$DISCORD_CLIENT_SECRET = getenv("DISCORD_CLIENT_SECRET") ?: "";
$DISCORD_REDIRECT_URI = getenv("DISCORD_REDIRECT_URI") ?: "";
