<?php
require __DIR__ . '/_lib.php';
$in = api_boot();
try { ok(user_payload(auth_user($in))); } catch (PDOException $e) { fail('server', 500); }
