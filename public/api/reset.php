<?php
require __DIR__ . '/_lib.php';
$in = api_boot();
$email = strtolower(trim((string)($in['email'] ?? '')));
$tok = (string)($in['reset_token'] ?? '');
$pass = (string)($in['password'] ?? '');
if (strlen($pass) < 8 || strlen($pass) > 200) fail('short_password');
try {
  $pdo = db();
  $q = $pdo->prepare('SELECT id FROM users WHERE email = ?'); $q->execute([$email]);
  $u = $q->fetch();
  if (!$u) fail('invalid_code', 400);
  $q = $pdo->prepare('SELECT * FROM resets WHERE user_id = ? AND verified = 1'); $q->execute([$u['id']]);
  $r = $q->fetch();
  if (!$r || (int)$r['expires_at'] < time() || !hash_equals((string)$r['reset_hash'], hash('sha256', $tok))) fail('invalid_code', 400);
  $pdo->prepare('UPDATE users SET password_hash = ?, failed = 0, locked_until = 0 WHERE id = ?')
      ->execute([password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
  $pdo->prepare('DELETE FROM resets WHERE user_id = ?')->execute([$u['id']]);
  $pdo->prepare('DELETE FROM tokens WHERE user_id = ?')->execute([$u['id']]);
  ok();
} catch (PDOException $e) {
  fail('server', 500);
}
