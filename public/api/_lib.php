<?php
declare(strict_types=1);

const NAME_CHANGE_DAYS = 15;
const MAX_FAILED = 5;
const LOCK_SECONDS = 300;

function env(string $k, ?string $d = null): ?string {
  $v = getenv($k);
  return ($v === false || $v === '') ? $d : $v;
}

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  if (env('DB_DRIVER') === 'sqlite') {
    $pdo = new PDO('sqlite:' . env('SQLITE_PATH', sys_get_temp_dir() . '/hdmarket.sqlite'));
  } else {
    $host = env('MYSQLHOST'); $port = env('MYSQLPORT', '3306');
    $name = env('MYSQLDATABASE'); $user = env('MYSQLUSER'); $pass = env('MYSQLPASSWORD', '');
    if ($url = env('MYSQL_URL')) {
      $u = parse_url($url);
      $host = $u['host'] ?? $host; $port = (string)($u['port'] ?? $port);
      $name = isset($u['path']) ? ltrim($u['path'], '/') : $name;
      $user = $u['user'] ?? $user; $pass = isset($u['pass']) ? urldecode($u['pass']) : $pass;
    }
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4", (string)$user, (string)$pass);
  }
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
  migrate($pdo);
  return $pdo;
}

function migrate(PDO $pdo): void {
  try { $pdo->query('SELECT 1 FROM resets LIMIT 1'); return; } catch (PDOException $e) {}
  $sqlite = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
  $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT AUTO_INCREMENT PRIMARY KEY';
  $big = $sqlite ? 'TEXT' : 'MEDIUMTEXT';
  $tail = $sqlite ? '' : ' CHARACTER SET utf8mb4';
  $pdo->exec("CREATE TABLE IF NOT EXISTS users (
    id $id, username VARCHAR(30) NOT NULL, username_lc VARCHAR(30) NOT NULL UNIQUE,
    email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
    avatar $big NULL, status VARCHAR(10) NOT NULL DEFAULT 'active',
    failed INT NOT NULL DEFAULT 0, locked_until BIGINT NOT NULL DEFAULT 0,
    name_changed_at BIGINT NOT NULL DEFAULT 0, last_login BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL)$tail");
  $pdo->exec("CREATE TABLE IF NOT EXISTS tokens (
    token_hash CHAR(64) PRIMARY KEY, user_id INT NOT NULL, created_at BIGINT NOT NULL)$tail");
  $pdo->exec("CREATE TABLE IF NOT EXISTS resets (
    id $id, user_id INT NOT NULL, code_hash CHAR(64) NOT NULL, attempts INT NOT NULL DEFAULT 0,
    expires_at BIGINT NOT NULL, verified INT NOT NULL DEFAULT 0, reset_hash CHAR(64) NULL,
    created_at BIGINT NOT NULL)$tail");
}

function api_boot(): array {
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  $origin = env('ALLOWED_ORIGIN', '*');
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Access-Control-Allow-Headers: Content-Type, Authorization');
  header('Access-Control-Allow-Methods: POST, OPTIONS');
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') exit;
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('invalid', 405);
  $raw = file_get_contents('php://input');
  if (strlen((string)$raw) > 600000) fail('too_big', 413);
  $in = json_decode((string)$raw, true);
  return is_array($in) ? $in : [];
}

function fail(string $code, int $http = 400, array $extra = []): void {
  http_response_code($http);
  echo json_encode(['error' => $code] + $extra);
  exit;
}
function ok(array $data = []): void { echo json_encode(['ok' => true] + $data); exit; }

function app_secret(): string {
  $s = env('APP_SECRET');
  if (!$s) fail('server_not_configured', 500);
  return $s;
}

function make_token(int $uid): string {
  $token = bin2hex(random_bytes(32));
  db()->prepare('INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?,?,?)')
      ->execute([hash('sha256', $token), $uid, time()]);
  return $token;
}

function auth_user(array $in): array {
  $t = (string)($in['token'] ?? '');
  if (!preg_match('/^[a-f0-9]{64}$/', $t)) fail('unauthorized', 401);
  $q = db()->prepare('SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?');
  $q->execute([hash('sha256', $t)]);
  $u = $q->fetch();
  if (!$u || $u['status'] !== 'active') fail('unauthorized', 401);
  return $u;
}

function user_payload(array $u): array {
  return [
    'username' => $u['username'], 'email' => $u['email'],
    'created' => (int)$u['created_at'], 'avatar' => $u['avatar'],
    'nameChangedAt' => (int)$u['name_changed_at'],
  ];
}

function valid_username(string $n): bool { return (bool)preg_match('/^.{2,30}$/u', $n); }

function code_hash(string $code, int $uid): string {
  return hash_hmac('sha256', $code, app_secret() . $uid);
}

/** Sends the reset code through the Resend HTTP API (Railway blocks plain SMTP on small plans). */
function send_reset_mail(string $to, string $lang, string $code): bool {
  $key = env('RESEND_API_KEY');
  if (!$key) return false;
  $t = [
    'ar' => ['كود استعادة كلمة المرور - HD Market', "كودك هو: $code\nصالح لمدة 10 دقائق. إذا لم تطلبه فتجاهل هذه الرسالة."],
    'en' => ['Your HD Market password reset code', "Your code is: $code\nIt is valid for 10 minutes. If you didn't request it, ignore this email."],
    'vi' => ['Mã khôi phục mật khẩu HD Market', "Mã của bạn là: $code\nCó hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này."],
    'zh' => ['HD Market 密码重置验证码', "你的验证码是：$code\n10分钟内有效。如果不是你本人操作，请忽略此邮件。"],
  ][$lang] ?? null;
  if (!$t) return false;
  $ch = curl_init('https://api.resend.com/emails');
  curl_setopt_array($ch, [
    CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode([
      'from' => env('MAIL_FROM', 'HD Market <onboarding@resend.dev>'),
      'to' => [$to], 'subject' => $t[0], 'text' => $t[1],
    ]),
  ]);
  curl_exec($ch);
  $code_http = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);
  return $code_http >= 200 && $code_http < 300;
}
