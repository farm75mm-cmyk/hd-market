<?php
require __DIR__ . '/_lib.php';
$in = api_boot();
$username = trim((string)($in['username'] ?? ''));
$email = strtolower(trim((string)($in['email'] ?? '')));
$pass = (string)($in['password'] ?? '');
if (!valid_username($username)) fail('invalid_username');
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) fail('invalid_email');
if (strlen($pass) < 8 || strlen($pass) > 200) fail('short_password');
try {
  $pdo = db();
  $q = $pdo->prepare('SELECT 1 FROM users WHERE email = ?'); $q->execute([$email]);
  if ($q->fetch()) fail('email_taken', 409);
  $q = $pdo->prepare('SELECT 1 FROM users WHERE username_lc = ?'); $q->execute([mb_strtolower($username)]);
  if ($q->fetch()) fail('username_taken', 409);
  $pdo->prepare('INSERT INTO users (username, username_lc, email, password_hash, created_at) VALUES (?,?,?,?,?)')
      ->execute([$username, mb_strtolower($username), $email, password_hash($pass, PASSWORD_DEFAULT), time()]);
  ok();
} catch (PDOException $e) {
  fail('server', 500);
}
