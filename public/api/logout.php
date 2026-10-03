<?php
require __DIR__ . '/_lib.php';
$in = api_boot();
$t = (string)($in['token'] ?? '');
if (preg_match('/^[a-f0-9]{64}$/', $t)) {
  try { db()->prepare('DELETE FROM tokens WHERE token_hash = ?')->execute([hash('sha256', $t)]); } catch (PDOException $e) {}
}
ok();
