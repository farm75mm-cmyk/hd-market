<?php
require __DIR__ . '/_lib.php';
$in = api_boot();
try {
  $pdo = db();
  $u = auth_user($in);
  $now = time();
  if (array_key_exists('username', $in)) {
    $name = trim((string)$in['username']);
    if (!valid_username($name)) fail('invalid_username');
    if ($name !== $u['username']) {
      $left = (int)ceil(((int)$u['name_changed_at'] + NAME_CHANGE_DAYS * 86400 - $now) / 86400);
      if ($u['name_changed_at'] && $left > 0) fail('too_soon', 429, ['days' => $left]);
      $q = $pdo->prepare('SELECT 1 FROM users WHERE username_lc = ? AND id <> ?');
      $q->execute([mb_strtolower($name), $u['id']]);
      if ($q->fetch()) fail('username_taken', 409);
      $pdo->prepare('UPDATE users SET username = ?, username_lc = ?, name_changed_at = ? WHERE id = ?')
          ->execute([$name, mb_strtolower($name), $now, $u['id']]);
    }
  }
  if (array_key_exists('avatar', $in)) {
    $av = $in['avatar'];
    if ($av !== null && (!is_string($av) || strlen($av) > 400000 || !preg_match('#^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$#', $av))) fail('invalid_avatar');
    $pdo->prepare('UPDATE users SET avatar = ? WHERE id = ?')->execute([$av, $u['id']]);
  }
  $q = $pdo->prepare('SELECT * FROM users WHERE id = ?'); $q->execute([$u['id']]);
  ok(user_payload($q->fetch()));
} catch (PDOException $e) {
  fail('server', 500);
}
