<?php
session_start();
require "config.php";

header("Cache-Control: no-store");

/* ================= SESSION HELPERS ================= */

function session_discord_id(){
    return $_SESSION["discord_id"]
        ?? ($_SESSION["user"]["id"] ?? null);
}

function session_discord_name(){
    return $_SESSION["discord_name"]
        ?? ($_SESSION["user"]["username"] ?? null);
}

function session_discord_avatar(){
    return $_SESSION["discord_avatar"]
        ?? ($_SESSION["user"]["avatar"] ?? null);
}

/* ================= ROLES ================= */

function user_role(){
    global $EDITORS, $COMMENTOR_DISCORD_IDS;

    $id = session_discord_id();
    if(!$id) return "Viewer";

    if(isset($EDITORS) && in_array($id,$EDITORS)) return "Editor";

    if(isset($COMMENTOR_DISCORD_IDS) && in_array($id,$COMMENTOR_DISCORD_IDS)){
        return "Commentor";
    }

    return "Viewer";
}


function is_editor(){
    return user_role()==="Editor";
}

function can_comment(){
    $r=user_role();
    return $r==="Editor" || $r==="Commentor";
}

/* ================= PATHS ================= */

$BOARD_META_FILE = $DATA_DIR . "/boards.json";

/* ================= COLORS ================= */

$COLOR_PALETTE=[
"#3b82f6","#10b981","#a855f7","#f59e0b",
"#ef4444","#14b8a6","#8b5cf6","#22c55e"
];

function load_board_meta(){
    global $BOARD_META_FILE;
    if(!file_exists($BOARD_META_FILE)) return [];
    $json=json_decode(file_get_contents($BOARD_META_FILE),true);
    if(!is_array($json)) return [];

    foreach($json as $k=>$v){
        if(is_string($v)){
            $json[$k]=["color"=>$v,"created"=>time()];
        }
    }
    return $json;
}

function save_board_meta($meta){
    global $BOARD_META_FILE;
    file_put_contents($BOARD_META_FILE,json_encode($meta));
}

function next_unique_color($meta){
    global $COLOR_PALETTE;
    $used=array_column($meta,"color");
    foreach($COLOR_PALETTE as $c){
        if(!in_array($c,$used)) return $c;
    }
    return $COLOR_PALETTE[array_rand($COLOR_PALETTE)];
}

function repair_duplicate_colors($meta){
    $seen=[];
    foreach($meta as $b=>$info){
        if(isset($seen[$info["color"]])){
            $meta[$b]["color"]=next_unique_color($meta);
        }
        $seen[$meta[$b]["color"]]=true;
    }
    return $meta;
}

/* ================= BOARD FILE ================= */

function board_filename_variants($name){
    global $DATA_DIR;
    $clean=preg_replace('~[^a-zA-Z0-9 _-]~','',$name);
    $canonical=$DATA_DIR."/".$clean.".json";
    $legacy=$DATA_DIR."/".str_replace(" ","_",$clean).".json";
    return [$canonical,$legacy,$clean];
}

function resolve_board_file($name){
    list($c,$l,$clean)=board_filename_variants($name);
    if(file_exists($c)) return $c;
    if(file_exists($l)) return $l;
    return $c;
}

/* ================= WHOAMI ================= */

if(isset($_GET["action"]) && $_GET["action"]==="whoami"){
    $id=session_discord_id();
    $name=session_discord_name();
    $avatar=session_discord_avatar();
    $role=user_role();

    echo json_encode([
        "id"=>$id,
        "name"=>$name,
        "avatar"=>$avatar,
        "role"=>$role,
        "editor"=>$role==="Editor"
    ]);
    exit;
}

/* ================= LOGOUT ================= */

if(isset($_GET["action"]) && $_GET["action"]==="logout"){
    session_destroy();
    echo "ok";
    exit;
}

/* ================= LIST BOARDS ================= */

if(isset($_GET["action"]) && $_GET["action"]==="boards"){
    global $DATA_DIR;

    $meta=load_board_meta();
    $boards=["Awucard"];

    foreach(glob($DATA_DIR."/*.json") as $f){
        if(basename($f)==="boards.json") continue;
        $n=str_replace("_"," ",basename($f,".json"));
        if(!in_array($n,$boards)) $boards[]=$n;
    }

    foreach($boards as $b){
        if(!isset($meta[$b])){
            $meta[$b]=[
                "color"=>next_unique_color($meta),
                "created"=>time()
            ];
        }
    }

    $meta=repair_duplicate_colors($meta);

    uasort($meta,function($a,$b){
        return $a["created"]<=>$b["created"];
    });

    save_board_meta($meta);

    echo json_encode([
        "boards"=>array_keys($meta),
        "colors"=>array_map(fn($v)=>$v["color"],$meta)
    ]);
    exit;
}

/* ================= BOARD CONTEXT ================= */

$board=$_GET["board"]??"Awucard";
$file=resolve_board_file($board);

/* ================= GET NOTES ================= */

if($_SERVER["REQUEST_METHOD"]==="GET"){
    if(!file_exists($file)) echo "[]";
    else echo file_get_contents($file);
    exit;
}

/* ================= NOTE WRITE ================= */

$data=json_decode(file_get_contents("php://input"),true);

$notes=file_exists($file)
    ? json_decode(file_get_contents($file),true)
    : [];

/* ===== EDITOR OPS ===== */

if(isset($data["type"]) && is_editor()){

    if($data["type"]==="create"){
        $notes[]=$data["note"];
    }

    if($data["type"]==="update"){
        foreach($notes as &$n){
            if($n["id"]==$data["note"]["id"]){
                $n=$data["note"];
            }
        }
    }

    if($data["type"]==="delete"){
        $notes=array_values(
            array_filter($notes,fn($n)=>$n["id"]!=$data["id"])
        );
    }
}

/* ===== COMMENT OPS ===== */

if(isset($data["type"]) && $data["type"]==="comment" && can_comment()){
    foreach($notes as &$n){
        if($n["id"]==$data["id"]){
            if(!isset($n["comments"])) $n["comments"]=[];
            $n["comments"][]=[
                "user"=>session_discord_name(),
                "text"=>$data["text"],
                "time"=>time()
            ];
        }
    }
}

/* ================= BOARD OPS ================= */

if(isset($data["action"]) && is_editor()){

    if($data["action"]==="createBoard"){
        list($c,$l,$clean)=board_filename_variants($data["name"]);
        if(!file_exists($c)&&!file_exists($l)) file_put_contents($c,"[]");

        $meta=load_board_meta();
        if(!isset($meta[$clean])){
            $meta[$clean]=[
                "color"=>next_unique_color($meta),
                "created"=>time()
            ];
            save_board_meta($meta);
        }
    }

    if($data["action"]==="renameBoard"){
        if($data["old"]==="Awucard") return;
        $old=resolve_board_file($data["old"]);
        list($newC,$newL,$clean)=board_filename_variants($data["new"]);
        if(file_exists($old)) rename($old,$newC);

        $meta=load_board_meta();
        if(isset($meta[$data["old"]])){
            $meta[$data["new"]]=$meta[$data["old"]];
            unset($meta[$data["old"]]);
            save_board_meta($meta);
        }
    }

    if($data["action"]==="deleteBoard"){
        if($data["name"]==="Awucard") return;
        $f=resolve_board_file($data["name"]);
        if(file_exists($f)) unlink($f);

        $meta=load_board_meta();
        unset($meta[$data["name"]]);
        save_board_meta($meta);
    }
}

/* ================= SAVE ================= */

file_put_contents($file,json_encode($notes));
