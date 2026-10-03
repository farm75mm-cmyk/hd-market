<?php
require __DIR__ . '/_lib.php';
$in = api_boot();
$id = mb_strtolower(trim((string)($in['username'] ?? '')));
$pass = (string)($in['password'] ?? '');
if ($id === '' || $pass === '') fail('invalid');
try {
  $pdo = db();
  $q = $pdo->prepare('SELECT * FROM users WHERE username_lc = ? OR email = ?');
  $q->execute([$id, $id]);
  $u = $q->fetch();
  if (!$u) fail('no_account', 404);
  if ($u['status'] !== 'active') fail('banned', 403);
  $now = time();
  if ((int)$u['locked_until'] > $now) fail('locked', 429, ['minutes' => (int)ceil(((int)$u['locked_until'] - $now) / 60)]);
  if (!password_verify($pass, $u['password_hash'])) {
    $failed = (int)$u['failed'] + 1;
    if ($failed >= MAX_FAILED) {
      $pdo->prepare('UPDATE users SET failed = 0, locked_until = ? WHERE id = ?')->execute([$now + LOCK_SECONDS, $u['id']]);
      fail('locked', 429, ['minutes' => (int)(LOCK_SECONDS / 60)]);
    }
    $pdo->prepare('UPDATE users SET failed = ? WHERE id = ?')->execute([$failed, $u['id']]);
    fail('wrong_password', 401);
  }
  $pdo->prepare('UPDATE users SET failed = 0, locked_until = 0, last_login = ? WHERE id = ?')->execute([$now, $u['id']]);
  ok(['token' => make_token((int)$u['id'])] + user_payload($u));
} catch (PDOException $e) {
  fail('server', 500);
}
