<?php
session_start();

// Load .env file if it exists (for local development)
if (file_exists(__DIR__ . "/.env")) {
    $env = parse_ini_file(__DIR__ . "/.env");
    foreach ($env as $key => $value) {
        if (!getenv($key)) {
            putenv("$key=$value");
        }
    }
}

$client_id = getenv("DISCORD_CLIENT_ID") ?: "1473995274035794011";
$client_secret = getenv("DISCORD_CLIENT_SECRET") ?: "lFucWyVEr2q1X3Ogu6jG7VbHM0aZrnYI";
$redirect_uri = getenv("DISCORD_REDIRECT_URI") ?: "https://notes.awucard.me/auth.php";

if (!isset($_GET["code"])) {

    $auth_url = "https://discord.com/oauth2/authorize".
        "?client_id=$client_id".
        "&response_type=code".
        "&scope=identify".
        "&redirect_uri=".urlencode($redirect_uri);

    header("Location: $auth_url");
    exit;
}

/* ---------- TOKEN ---------- */
$ch = curl_init("https://discord.com/api/oauth2/token");
curl_setopt_array($ch,[
    CURLOPT_RETURNTRANSFER=>true,
    CURLOPT_POST=>true,
    CURLOPT_POSTFIELDS=>http_build_query([
        "client_id"=>$client_id,
        "client_secret"=>$client_secret,
        "grant_type"=>"authorization_code",
        "code"=>$_GET["code"],
        "redirect_uri"=>$redirect_uri
    ]),
    CURLOPT_HTTPHEADER=>[
        "Content-Type: application/x-www-form-urlencoded"
    ]
]);

$res=json_decode(curl_exec($ch),true);
$access=$res["access_token"]??null;

if(!$access){
    echo "OAuth failed";
    exit;
}

/* ---------- USER ---------- */
$ch=curl_init("https://discord.com/api/users/@me");
curl_setopt_array($ch,[
    CURLOPT_RETURNTRANSFER=>true,
    CURLOPT_HTTPHEADER=>[
        "Authorization: Bearer $access"
    ]
]);

$user=json_decode(curl_exec($ch),true);

$_SESSION["user"]=$user;

header("Location: /");
exit;
