<?php
require __DIR__ . '/_lib.php';
$in = api_boot();
$email = strtolower(trim((string)($in['email'] ?? '')));
$code = preg_replace('/\D/', '', (string)($in['code'] ?? ''));
try {
  $pdo = db();
  $q = $pdo->prepare('SELECT id FROM users WHERE email = ?'); $q->execute([$email]);
  $u = $q->fetch();
  if (!$u) fail('invalid_code', 400);
  $q = $pdo->prepare('SELECT * FROM resets WHERE user_id = ?'); $q->execute([$u['id']]);
  $r = $q->fetch();
  if (!$r || (int)$r['expires_at'] < time() || (int)$r['attempts'] >= 5) fail('invalid_code', 400);
  if (!hash_equals($r['code_hash'], code_hash($code, (int)$u['id']))) {
    $pdo->prepare('UPDATE resets SET attempts = attempts + 1 WHERE id = ?')->execute([$r['id']]);
    fail('invalid_code', 400);
  }
  $tok = bin2hex(random_bytes(24));
  $pdo->prepare('UPDATE resets SET verified = 1, reset_hash = ? WHERE id = ?')->execute([hash('sha256', $tok), $r['id']]);
  ok(['reset_token' => $tok]);
} catch (PDOException $e) {
  fail('server', 500);
}
