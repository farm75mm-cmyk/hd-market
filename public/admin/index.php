<?php
declare(strict_types=1);
require __DIR__ . '/../api/_lib.php';

header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
header('Cache-Control: no-store');

$https = (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') || !empty($_SERVER['HTTPS']);
session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => $https, 'path' => '/admin']);
session_name('hdadmin');
session_start();

function h(?string $s): string { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function page(string $title, string $body): void {
  echo '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' . h($title) . '</title><style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,Tahoma,sans-serif;background:#f4f4f2;color:#111}
header{background:#111;color:#fff;padding:14px 18px;display:flex;align-items:center;gap:12px;border-bottom:4px solid #e8a900}
header h1{font-size:19px;margin:0;flex:1}header h1 b{color:#e8a900}
header form{margin:0}.wrap{max-width:1100px;margin:auto;padding:18px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}
.card{background:#fff;border-radius:16px;padding:16px;border:1px solid #e5e5e0}.card small{color:#777;display:block;margin-bottom:6px}.card b{font-size:28px}
.box{background:#fff;border:1px solid #e5e5e0;border-radius:16px;padding:16px;margin-bottom:18px;overflow-x:auto}
h2{font-size:17px;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:start;padding:9px 8px;border-bottom:1px solid #eee;vertical-align:middle}
th{color:#777;font-weight:600}.av{width:38px;height:38px;border-radius:50%;background:#111;color:#fff;display:inline-grid;place-items:center;font-weight:700;overflow:hidden;vertical-align:middle}.av img{width:100%;height:100%;object-fit:cover}
input[type=text],input[type=password]{padding:10px 12px;border:1.5px solid #ddd;border-radius:12px;font-size:15px;width:100%}
button{font:inherit;border:0;border-radius:10px;padding:8px 12px;cursor:pointer;background:#111;color:#fff}button.g{background:#eee;color:#111}button.r{background:#c62828}button.y{background:#e8a900;color:#111}
.tag{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;background:#e6f4e6;color:#1b6b1b}.tag.b{background:#fde8e8;color:#b71c1c}
.acts{display:flex;gap:6px;flex-wrap:wrap}.acts form{margin:0}.msg{background:#fff7d6;border:1px solid #e8c500;border-radius:12px;padding:12px;margin-bottom:14px}
.err{background:#fde8e8;border:1px solid #e57373;color:#b71c1c;border-radius:12px;padding:12px;margin-bottom:14px}
.bars{display:flex;align-items:flex-end;gap:6px;height:120px}.bars div{flex:1;background:#e8a900;border-radius:6px 6px 0 0;min-height:3px;position:relative}.bars span{position:absolute;top:-18px;inset-inline:0;text-align:center;font-size:11px}
.lbl{display:flex;gap:6px;font-size:10px;color:#777}.lbl span{flex:1;text-align:center}
.login{max-width:360px;margin:12vh auto;background:#fff;padding:24px;border-radius:20px;border:1px solid #e5e5e0}.login label{display:block;font-weight:700;margin:12px 0 6px}
.pg{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}.pg a{padding:6px 12px;background:#eee;border-radius:10px;text-decoration:none;color:#111}.pg a.on{background:#111;color:#fff}
</style></head><body>' . $body . '</body></html>';
  exit;
}

$user = env('ADMIN_USER'); $pass = env('ADMIN_PASSWORD');
if (!$user || !$pass || strlen($pass) < 8) {
  page('لوحة التحكم', '<div class="login"><h2>لوحة التحكم غير مفعّلة</h2><p>اضبط المتغيّرين <code>ADMIN_USER</code> و<code>ADMIN_PASSWORD</code> (8 أحرف على الأقل) في إعدادات الخدمة على Railway.</p></div>');
}

if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
$csrf = $_SESSION['csrf'];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['do'] ?? '') === 'login') {
  $wait = ($_SESSION['fails'] ?? 0);
  if ($wait >= 5 && time() < ($_SESSION['until'] ?? 0)) {
    $_SESSION['loginerr'] = 'محاولات كثيرة. انتظر دقيقة.';
  } else {
    $okU = hash_equals(hash('sha256', $user), hash('sha256', (string)($_POST['u'] ?? '')));
    $okP = hash_equals(hash('sha256', $pass), hash('sha256', (string)($_POST['p'] ?? '')));
    if ($okU && $okP) {
      session_regenerate_id(true);
      $_SESSION['admin'] = true; $_SESSION['fails'] = 0; $_SESSION['csrf'] = bin2hex(random_bytes(16));
    } else {
      sleep(1);
      $_SESSION['fails'] = $wait + 1; $_SESSION['until'] = time() + 60;
      $_SESSION['loginerr'] = 'بيانات الدخول غير صحيحة.';
    }
  }
  header('Location: /admin/'); exit;
}

if (empty($_SESSION['admin'])) {
  $e = $_SESSION['loginerr'] ?? ''; unset($_SESSION['loginerr']);
  page('دخول لوحة التحكم', '<form class="login" method="post"><h2>HD Market · لوحة التحكم</h2>' . ($e ? '<div class="err">' . h($e) . '</div>' : '') .
    '<input type="hidden" name="do" value="login"><label>اسم المدير</label><input type="text" name="u" autocomplete="username" required><label>كلمة المرور</label><input type="password" name="p" autocomplete="current-password" required><p><button style="width:100%;padding:12px">دخول</button></p></form>');
}

$pdo = db();
$flash = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  if (!hash_equals($csrf, (string)($_POST['csrf'] ?? ''))) { http_response_code(403); exit('CSRF'); }
  $do = (string)($_POST['do'] ?? ''); $id = (int)($_POST['id'] ?? 0);
  if ($do === 'logout') { session_destroy(); header('Location: /admin/'); exit; }
  if ($id > 0) {
    $q = $pdo->prepare('SELECT * FROM users WHERE id = ?'); $q->execute([$id]); $t = $q->fetch();
    if ($t) {
      if ($do === 'ban') { $pdo->prepare("UPDATE users SET status='banned' WHERE id=?")->execute([$id]); $pdo->prepare('DELETE FROM tokens WHERE user_id=?')->execute([$id]); $flash = 'تم حظر ' . $t['username']; }
      elseif ($do === 'unban') { $pdo->prepare("UPDATE users SET status='active' WHERE id=?")->execute([$id]); $flash = 'تم رفع الحظر عن ' . $t['username']; }
      elseif ($do === 'unlock') { $pdo->prepare('UPDATE users SET failed=0, locked_until=0 WHERE id=?')->execute([$id]); $flash = 'تم فتح قفل ' . $t['username']; }
      elseif ($do === 'noavatar') { $pdo->prepare('UPDATE users SET avatar=NULL WHERE id=?')->execute([$id]); $flash = 'تم حذف صورة ' . $t['username']; }
      elseif ($do === 'resetpw') {
        $tmp = substr(strtr(base64_encode(random_bytes(9)), '+/=', 'xyz'), 0, 10);
        $pdo->prepare('UPDATE users SET password_hash=?, failed=0, locked_until=0 WHERE id=?')->execute([password_hash($tmp, PASSWORD_DEFAULT), $id]);
        $pdo->prepare('DELETE FROM tokens WHERE user_id=?')->execute([$id]);
        $flash = 'كلمة مرور مؤقتة لـ ' . $t['username'] . ' (تظهر مرة واحدة): ' . $tmp;
      }
      elseif ($do === 'delete') { $pdo->prepare('DELETE FROM tokens WHERE user_id=?')->execute([$id]); $pdo->prepare('DELETE FROM resets WHERE user_id=?')->execute([$id]); $pdo->prepare('DELETE FROM users WHERE id=?')->execute([$id]); $flash = 'تم حذف ' . $t['username']; }
    }
  }
}

$now = time();
$count = fn(string $sql, array $p = []) => (int)(function () use ($pdo, $sql, $p) { $q = $pdo->prepare($sql); $q->execute($p); return array_values($q->fetch())[0]; })();
$total = $count('SELECT COUNT(*) FROM users');
$today = $count('SELECT COUNT(*) FROM users WHERE created_at >= ?', [strtotime('today')]);
$week = $count('SELECT COUNT(*) FROM users WHERE created_at >= ?', [$now - 7 * 86400]);
$banned = $count("SELECT COUNT(*) FROM users WHERE status = 'banned'");
$online = $count('SELECT COUNT(*) FROM users WHERE last_login >= ?', [$now - 86400]);
$withAv = $count('SELECT COUNT(*) FROM users WHERE avatar IS NOT NULL');

$days = [];
for ($i = 13; $i >= 0; $i--) {
  $from = strtotime("today -$i day"); $to = $from + 86400;
  $days[] = [date('d/m', $from), $count('SELECT COUNT(*) FROM users WHERE created_at >= ? AND created_at < ?', [$from, $to])];
}
$max = max(1, ...array_column($days, 1));

$search = trim((string)($_GET['q'] ?? ''));
$pageNo = max(1, (int)($_GET['pg'] ?? 1)); $per = 20;
$where = ''; $params = [];
if ($search !== '') { $where = 'WHERE username_lc LIKE ? OR email LIKE ?'; $like = '%' . mb_strtolower($search) . '%'; $params = [$like, $like]; }
$matches = $count("SELECT COUNT(*) FROM users $where", $params);
$pages = max(1, (int)ceil($matches / $per));
$q = $pdo->prepare("SELECT id, username, email, avatar, status, failed, locked_until, last_login, created_at FROM users $where ORDER BY id DESC LIMIT $per OFFSET " . (($pageNo - 1) * $per));
$q->execute($params);
$rows = $q->fetchAll();

$fmt = fn(int $t) => $t ? date('Y-m-d H:i', $t) : '—';
$btn = function (string $do, int $id, string $label, string $cls = 'g', string $confirm = '') use ($csrf) {
  $c = $confirm ? ' onsubmit="return confirm(\'' . h($confirm) . '\')"' : '';
  return '<form method="post"' . $c . '><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="do" value="' . $do . '"><input type="hidden" name="id" value="' . $id . '"><button class="' . $cls . '">' . $label . '</button></form>';
};

$out = '<header><h1>HD <b>Market</b> · لوحة التحكم</h1><form method="post"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="do" value="logout"><button class="g">خروج</button></form></header><div class="wrap">';
if ($flash) $out .= '<div class="msg">' . h($flash) . '</div>';
$out .= '<div class="cards"><div class="card"><small>إجمالي المستخدمين</small><b>' . $total . '</b></div><div class="card"><small>سجّلوا اليوم</small><b>' . $today . '</b></div><div class="card"><small>آخر 7 أيام</small><b>' . $week . '</b></div><div class="card"><small>دخلوا خلال 24 ساعة</small><b>' . $online . '</b></div><div class="card"><small>لديهم صورة</small><b>' . $withAv . '</b></div><div class="card"><small>محظورون</small><b>' . $banned . '</b></div></div>';
$out .= '<div class="box"><h2>التسجيلات آخر 14 يومًا</h2><div class="bars" dir="ltr">';
foreach ($days as [$d, $n]) $out .= '<div style="height:' . max(3, (int)round($n / $max * 100)) . '%"><span>' . $n . '</span></div>';
$out .= '</div><div class="lbl" dir="ltr">';
foreach ($days as [$d]) $out .= '<span>' . $d . '</span>';
$out .= '</div></div>';
$out .= '<div class="box"><h2>المستخدمون (' . $matches . ')</h2><form method="get" style="display:flex;gap:8px;margin-bottom:12px"><input type="text" name="q" value="' . h($search) . '" placeholder="بحث بالاسم أو البريد"><button>بحث</button></form><table><tr><th></th><th>الاسم</th><th>البريد</th><th>الحالة</th><th>تسجيل</th><th>آخر دخول</th><th>إجراءات</th></tr>';
foreach ($rows as $r) {
  $locked = (int)$r['locked_until'] > $now;
  $av = $r['avatar'] ? '<img src="' . h($r['avatar']) . '" alt="">' : h(mb_strtoupper(mb_substr($r['username'], 0, 1)));
  $st = $r['status'] === 'banned' ? '<span class="tag b">محظور</span>' : ($locked ? '<span class="tag b">مقفل مؤقتًا</span>' : '<span class="tag">نشط</span>');
  $acts = ($r['status'] === 'banned' ? $btn('unban', (int)$r['id'], 'رفع الحظر', 'y') : $btn('ban', (int)$r['id'], 'حظر', 'g', 'حظر هذا المستخدم؟'))
    . ($locked || (int)$r['failed'] > 0 ? $btn('unlock', (int)$r['id'], 'فتح القفل') : '')
    . $btn('resetpw', (int)$r['id'], 'كلمة مرور مؤقتة', 'g', 'إنشاء كلمة مرور مؤقتة وتسجيل خروجه؟')
    . ($r['avatar'] ? $btn('noavatar', (int)$r['id'], 'حذف الصورة') : '')
    . $btn('delete', (int)$r['id'], 'حذف', 'r', 'حذف الحساب نهائيًا؟');
  $out .= '<tr><td><span class="av">' . $av . '</span></td><td>' . h($r['username']) . '</td><td dir="ltr" style="text-align:start">' . h($r['email']) . '</td><td>' . $st . '</td><td>' . $fmt((int)$r['created_at']) . '</td><td>' . $fmt((int)$r['last_login']) . '</td><td><div class="acts">' . $acts . '</div></td></tr>';
}
if (!$rows) $out .= '<tr><td colspan="7" style="text-align:center;color:#777;padding:24px">لا يوجد مستخدمون.</td></tr>';
$out .= '</table><div class="pg">';
for ($i = 1; $i <= $pages && $i <= 30; $i++) $out .= '<a class="' . ($i === $pageNo ? 'on' : '') . '" href="?pg=' . $i . ($search !== '' ? '&q=' . urlencode($search) : '') . '">' . $i . '</a>';
$out .= '</div></div></div>';
page('لوحة التحكم', $out);
