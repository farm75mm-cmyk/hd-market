<?php
require __DIR__ . '/_lib.php';
$in = api_boot();
$email = strtolower(trim((string)($in['email'] ?? '')));
$lang = (string)($in['lang'] ?? 'ar');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('invalid_email');
try {
  $pdo = db();
  $q = $pdo->prepare('SELECT * FROM users WHERE email = ?'); $q->execute([$email]);
  $u = $q->fetch();
  if (!$u) fail('no_account', 404);
  if ($u['status'] !== 'active') fail('banned', 403);
  $now = time();
  $q = $pdo->prepare('SELECT COUNT(*) c FROM resets WHERE user_id = ? AND created_at > ?'); $q->execute([$u['id'], $now - 3600]);
  if ((int)$q->fetch()['c'] >= 5) fail('too_many', 429);
  $code = (string)random_int(1000, 9999);
  $pdo->prepare('DELETE FROM resets WHERE user_id = ?')->execute([$u['id']]);
  $pdo->prepare('INSERT INTO resets (user_id, code_hash, expires_at, created_at) VALUES (?,?,?,?)')
      ->execute([$u['id'], code_hash($code, (int)$u['id']), $now + 600, $now]);
  if (!send_reset_mail($email, $lang, $code)) {
    if (env('DEBUG_RETURN_CODE') === '1') ok(['debug_code' => $code]);
    fail('mail_failed', 502);
  }
  ok();
} catch (PDOException $e) {
  fail('server', 500);
}
