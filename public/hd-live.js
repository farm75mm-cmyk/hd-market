/* HD Market live overlay v5 */
(function(){
"use strict";
const HD={cfg:null,cats:[],prods:[],orders:[],msgs:[],sel:null,rc:null,qty:{},open:0,tick:0};
const E=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css=document.createElement("style");
const CSS_TEXT=".xb{position:sticky;top:0;z-index:40;background:#E8A900;color:#111;text-align:center;font-weight:800;padding:9px 12px;font-size:14px}\n.xm{position:fixed;inset:0;z-index:999;background:var(--bg);display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}\n.xm h2{font-size:26px;margin:10px 0}.xm p{color:var(--mute);margin-bottom:20px;line-height:1.6}\n.xbtn{border:0;border-radius:12px;background:var(--btn);color:var(--btnink);font:800 15px inherit;font-family:inherit;padding:10px 16px;cursor:pointer}\n.xs{width:34px;height:34px;border:0;border-radius:10px;background:var(--field);color:var(--ink);font-size:20px;cursor:pointer}\n.xc{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px;margin-bottom:12px}\n.xc small,.xpi small{color:var(--mute);display:block;margin-top:4px}\n.xr{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}.xr.sp{justify-content:space-between;margin-top:0}\n.xchip{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:800;background:var(--field)}\n.xchip.st-new,.xchip.t-pending{background:#FFF3CD;color:#6b5200}.xchip.st-done,.xchip.t-approved{background:#E6F4E6;color:#1b6b1b}.xchip.st-cancelled,.xchip.t-rejected,.xchip.bad{background:#FDE8E8;color:#b71c1c}.xchip.st-processing{background:#DCEBFF;color:#1a4fa0}\n.xin{width:100%;height:50px;border-radius:14px;border:1.5px solid var(--line);background:var(--field);color:var(--ink);font:600 16px inherit;font-family:inherit;padding-inline:14px;margin:6px 0}\n.xfile{display:flex;align-items:center;justify-content:center;height:50px;border-radius:14px;border:1.5px dashed var(--ink);font-weight:800;cursor:pointer;margin:8px 0}\n.xrp{width:100%;max-height:220px;object-fit:contain;border-radius:14px;margin:6px 0 10px}\n.xw{display:flex;align-items:center;gap:10px;background:var(--card);border:2px solid var(--line);border-radius:16px;padding:10px;margin-bottom:10px;cursor:pointer}\n.xw.on{border-color:var(--ink)}.xw img,.xw .xph{width:46px;height:46px;border-radius:12px;object-fit:cover;background:var(--field);flex:none}\n.xw .xwi{flex:1;min-width:0}.xw b{display:block}.xw small{color:var(--mute)}.xw bdi{font-weight:800;color:var(--ink)}\n.xp{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.xp img,.xp .xph{width:78px;height:78px;border-radius:14px;object-fit:cover;background:var(--field);flex:none}.xpi{flex:1;min-width:0}\n.xi2{width:100%;height:100%;object-fit:cover;border-radius:14px}\n.xchat{display:flex;flex-direction:column;gap:8px;max-height:52vh;overflow:auto;margin-bottom:12px;padding:4px 0}\n.xmg{max-width:82%;padding:9px 13px;border-radius:16px;white-space:pre-wrap;line-height:1.5;font-weight:600}\n.xmg.me{align-self:flex-end;background:var(--btn);color:var(--btnink)}.xmg.ad{align-self:flex-start;background:var(--card);border:1px solid var(--line)}\n.xmg small{display:block;opacity:.6;font-size:11px;margin-top:2px}\n.xchip.on{background:var(--ink);color:var(--bg)}\nbutton.xchip{border:0;font-family:inherit;cursor:pointer}\n.xmut{color:var(--mute);font-weight:600;margin-bottom:8px;line-height:1.6}\n.xerr{background:var(--errbg);color:var(--err);border-radius:12px;padding:9px 12px;font-weight:700;margin:8px 0}\n.xcode{font-family:ui-monospace,monospace;background:var(--field);border-radius:12px;padding:10px 12px;white-space:pre-wrap;word-break:break-all;direction:ltr;text-align:left;margin:8px 0}\n.xdone{text-align:center;padding:6px 0}.xdone .big{font-size:46px}.xdone .pz{font-size:26px;font-weight:900;margin:10px 0}\n.xbd{position:absolute;top:6px;inset-inline-end:6px;background:#e53935;color:#fff;border-radius:99px;min-width:16px;height:16px;font-size:10px;font-weight:800;display:grid;place-items:center;padding:0 3px}\n.ic button{position:relative}\nnav button{position:relative}nav .xbd{top:2px;inset-inline-end:calc(50% - 22px)}\n.sg{margin:0 16px 16px;border:1px solid var(--line);border-radius:28px;background:var(--card);overflow:hidden}\n.sr{display:flex;align-items:center;gap:14px;padding:16px 18px;min-height:82px;width:100%;background:none;border:0;border-bottom:1px solid var(--line);color:inherit;font-family:inherit;text-align:start;cursor:pointer}\n.sg .sr:last-child{border-bottom:0}\n.sr .si{width:58px;height:58px;border-radius:18px;background:var(--field);display:grid;place-items:center;flex:none}\n.sr .si svg{width:29px;height:29px}\n.sr .sl{flex:1;font-weight:800;font-size:20px}\n.sr .sv{color:#9b9b9b;font-size:17px;display:flex;align-items:center;gap:6px;flex:none}\n.sr .sv svg{width:24px;height:24px}\n[dir=rtl] .sr .sv svg.chv{transform:scaleX(-1)}\n.sr.red .sl{color:#c52b50}.sr.red .si{background:#fdecef;color:#c52b50}\n.sw{width:58px;height:34px;border-radius:99px;background:#d3d3d3;position:relative;flex:none;transition:.2s}\n.sw::after{content:\"\";position:absolute;top:3px;inset-inline-start:3px;width:28px;height:28px;border-radius:50%;background:#fff;transition:.2s}\n.sw.on{background:#000}.sw.on::after{inset-inline-start:27px}\n.sh2{font-size:20px;font-weight:800;color:var(--mute);margin:18px 20px 10px}\n.xtn{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-weight:700}\n.xtn span{flex:1}\n.xnote{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:12px 14px;margin:0 16px 12px}\n";

  css.textContent = CSS_TEXT + ".sl{white-space:nowrap}.sr.lgr{min-height:76px;padding:12px 22px;gap:18px}.sr.lgr .rd{margin:0;width:30px;height:30px}.sr.lgr .sl{font-weight:500;font-size:22px}.xw2{flex-wrap:wrap;align-items:center}.xw2 .wic{background:#222;border-radius:16px;width:54px;height:54px;display:grid;place-items:center;flex:none}.xw2 .wq{flex-basis:100%;color:#b9b9b9;font-weight:700;font-size:14px;margin-top:2px;padding-inline-start:64px}.xw2 .wr .cur .xbi{border-radius:50%;background:none}.cc{border:0!important;position:relative;min-height:170px}.cc .go2{display:none}.hrt{position:absolute;top:8px;inset-inline-end:8px;z-index:2;border:0;border-radius:99px;background:rgba(255,255,255,.85);color:#555;font-size:18px;line-height:1;padding:6px 10px;font-family:inherit}.hrt.on{color:#E53935}.xi3{width:34px;height:34px;object-fit:contain;display:block}.cwl{border:1px solid var(--line);border-radius:22px;overflow:hidden;margin-top:12px}.cw{display:flex;align-items:center;gap:12px;padding:14px;border-bottom:1px solid var(--line);cursor:pointer}.cw:last-child{border:0}.cwi{flex:1;min-width:0}.cwi b{display:block;font-size:16px}.cwi small{color:var(--mute);font-weight:700;font-size:14px}.tile span{display:grid;place-items:center;height:40px}.tile{min-width:74px!important;padding:10px 12px!important;gap:4px!important;font-size:14px!important;font-weight:800!important;white-space:nowrap}.xi3{width:40px!important;height:40px!important;border-radius:8px}.sh h2 svg{width:26px;height:26px;vertical-align:-4px}.cur{white-space:nowrap}.wr b{font-size:28px!important}.xw2 .wr{flex-wrap:wrap;gap:4px 8px}.xw2 .tp{padding:12px 12px;font-size:13px}.xw2{gap:8px}.xbi{display:inline-flex;flex:none;border-radius:12px;overflow:hidden;background:var(--field)}.xbi svg,.xbi img{width:100%;height:100%;object-fit:cover;display:block}.xinfo{display:flex;align-items:center;gap:8px;margin:8px 2px;color:var(--mute);font-weight:700;font-size:14px}.xinfo .xbi{border-radius:50%;background:none}nav{padding-bottom:calc(52px + env(safe-area-inset-bottom,0px))!important;border:1px solid #8B5CF6!important;box-sizing:border-box}.app{padding-bottom:160px!important}.wic .xbi{border-radius:50%;background:none}.xtg label{display:block;font-weight:700;margin:10px 0 6px}.xtg .xin{width:100%}nav button span{filter:none!important;display:flex;height:26px;align-items:center}nav button span svg{width:26px;height:26px;stroke-width:1.8}nav button.on span{color:#E8A900}.rd{width:26px;height:26px;border-radius:50%;border:2px solid #cfcfcf;margin-inline-start:auto;flex:none;display:flex;align-items:center;justify-content:center;box-sizing:border-box}.rd.on{background:#111;border-color:#111}.rd svg{width:16px;height:16px}.sv{font-size:13px;white-space:nowrap}";
  document.head.appendChild(css);

  /* ---------- small helpers ---------- */
  const Z = (...a) => a[li()] ?? a[1];
  const CURS = ["JOD", "IQD", "USDT"], DEC = { JOD: 3, IQD: 0, USDT: 4 };
  const LSg = (k, d) => { try { const v = localStorage.getItem("hd-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const LSs = (k, v) => { try { localStorage.setItem("hd-" + k, JSON.stringify(v)); } catch (e) {} };
  const post = (m) => { try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} };
  const APP_VER = "4.0.0";
  const TONES = ["soft_bell", "bell", "marimba", "harp", "bubble", "digital", "loud", "calm", "ding", "silent"];
  HD.cur = LSg("cur", "JOD"); HD.notif = LSg("notif", true); HD.tone = LSg("tone", "soft_bell");
  HD.lastN = LSg("lastn", 0); HD.lastS = LSg("lasts", 0); HD.page = null; HD.unread = 0; HD.sup = 0;
  HD.opt = null; HD.farms = []; HD.codes = []; HD.boxes = []; HD.grp = []; HD.cq = {}; HD.counts = { opt: 0, farms: 0, codes: 0, boxes: 0 };
  const idem = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const rates = () => (HD.cfg && HD.cfg.rates) || HD.rates || {};
  const rate = (c) => (c === "USDT" ? 1 : rates()[c] || 1);
  const cv = (usdt, c = HD.cur) => { const f = 10 ** DEC[c]; return Math.ceil(usdt * rate(c) * f - 1e-7) / f; };
  const nf = (v, c) => Number(v).toLocaleString("en-US", { minimumFractionDigits: c === "IQD" ? 0 : Math.min(2, DEC[c]), maximumFractionDigits: DEC[c] });
  const amt = (v, c = HD.cur) => `${nf(v, c)} ${c}`;
  const mon = (usdt, c = HD.cur) => amt(cv(usdt, c), c);
  const bal = (c = HD.cur) => (ME && ME.balances ? Number(ME.balances[c] || 0) : 0);
  const fdate = (ts) => new Date(ts * 1000).toLocaleString(LOC[L], { dateStyle: "medium", timeStyle: "short" });
  function setBal(b) {
    if (!b || !ME) return;
    ME.balances = b; ME.balance = b.JOD; BAL = bal();
    document.querySelectorAll(".wal b").forEach((el) => (el.textContent = nf(bal(), HD.cur)));
    document.querySelectorAll(".wp > span").forEach((el) => (el.textContent = nf(bal(), HD.cur)));
  }
  const ERR = {
    insufficient_balance: ["رصيدك غير كافٍ. اشحن رصيدك أولًا.", "Insufficient balance. Top up first.", "Số dư không đủ. Hãy nạp tiền trước.", "余额不足，请先充值。"],
    out_of_stock: ["الكمية غير متوفرة.", "Not enough stock.", "Không đủ hàng.", "库存不足。"],
    tag_required: ["أدخل Tag المزرعة وسعة المخزن.", "Enter your farm Tag and storage capacity.", "Nhập Tag nông trại và sức chứa kho.", "请输入农场 Tag 和仓库容量。"],
    tag_limit: ["تجاوزت الحد الأقصى لهذا الـ Tag.", "Limit reached for this Tag.", "Đã đạt giới hạn cho Tag này.", "此 Tag 已达上限。"],
    limit_exceeded: ["تجاوزت الحد المسموح للطلب الواحد.", "Over the per-order limit.", "Vượt quá giới hạn mỗi đơn.", "超出单笔订单限制。"],
    out_of_limits: ["المبلغ خارج الحدود المسموحة.", "Amount outside the allowed limits.", "Số tiền ngoài giới hạn cho phép.", "金额超出允许范围。"],
    network: ["تعذّر الاتصال بالخادم.", "Can't reach the server.", "Không kết nối được máy chủ.", "无法连接服务器。"],
    too_many: ["طلبات كثيرة. حاول لاحقًا.", "Too many requests. Try later.", "Quá nhiều yêu cầu. Thử lại sau.", "请求过多，请稍后再试。"],
    not_found: ["غير موجود.", "Not found.", "Không tìm thấy.", "未找到。"],
    bad_transition: ["لا يمكن تنفيذ العملية في هذه الحالة.", "Not possible in this state.", "Không thể thực hiện ở trạng thái này.", "当前状态无法操作。"],
  };
  const emsg = (r) => { const m = ERR[r && r.error]; return m ? Z(...m) : Z("حدث خطأ. حاول مجددًا.", "Something went wrong. Try again.", "Đã xảy ra lỗi. Thử lại.", "出错了，请重试。"); };
  async function call(name, body) {
    const r = await api(name, { token: TOKEN, ...body });
    if (r.error == "unauthorized") sessionOut();
    return r;
  }

  /* ---------- statuses ---------- */
  const ST = {
    awaiting_payment: ["بانتظار الدفع", "Awaiting payment", "Chờ thanh toán", "待付款", "o"], proof_sent: ["تم إرسال إثبات الدفع", "Proof sent", "Đã gửi chứng từ", "凭证已发送", "o"],
    under_review: ["قيد المراجعة", "Under review", "Đang xem xét", "审核中", "o"], verifying: ["قيد التحقق", "Verifying", "Đang xác minh", "核实中", "o"],
    approved: ["تمت الموافقة", "Approved", "Đã duyệt", "已批准", "g"], credited: ["تمت إضافة الرصيد", "Credited", "Đã cộng tiền", "已到账", "g"],
    rejected: ["مرفوض", "Rejected", "Bị từ chối", "已拒绝", "r"], cancelled: ["ملغي", "Cancelled", "Đã hủy", "已取消", "r"], expired: ["منتهي الصلاحية", "Expired", "Hết hạn", "已过期", "n"],
    amount_mismatch: ["مبلغ غير مطابق", "Amount mismatch", "Số tiền không khớp", "金额不符", "r"], reversed: ["تم عكس العملية", "Reversed", "Đã hoàn tác", "已冲正", "r"],
    done: ["مكتمل", "Done", "Hoàn thành", "已完成", "g"], new: ["جديد", "New", "Mới", "新", "o"], processing: ["قيد التنفيذ", "Processing", "Đang xử lý", "处理中", "o"],
  };
  const stChip = (s) => { const x = ST[s] || [s, s, s, s, "n"]; return `<span class="xchip st-${x[4] == "g" ? "done" : x[4] == "r" ? "cancelled" : x[4] == "o" ? "new" : ""}">${E(Z(x[0], x[1], x[2], x[3]))}</span>`; };
  const TT = { deposit: ["شحن", "Top-up", "Nạp tiền", "充值"], purchase: ["شراء", "Purchase", "Mua hàng", "购买"], refund: ["استرجاع", "Refund", "Hoàn tiền", "退款"], admin_credit: ["إضافة من الإدارة", "Admin credit", "Quản trị cộng tiền", "管理员加款"], admin_debit: ["خصم من الإدارة", "Admin debit", "Quản trị trừ tiền", "管理员扣款"], reversal: ["عكس عملية", "Reversal", "Hoàn tác", "冲正"] };
  const KIND = { tool: ["أدوات", "Tools", "Công cụ", "工具"], opt: ["منتجات اختياري", "Optional", "Tùy chọn", "自选"], farm: ["مزرعة", "Farm", "Nông trại", "农场"], code: ["كود", "Code", "Mã", "代码"], random: ["عشوائي", "Random", "Ngẫu nhiên", "随机"] };

  /* ---------- UI strings (4 languages) ---------- */
  const U = {
    ftag: ["Tag المزرعة", "Farm Tag", "Tag nông trại", "农场 Tag"], fcap: ["سعة المخزن", "Storage capacity", "Sức chứa kho", "仓库容量"],
    pack: ["السعة", "Count", "Số lượng gói", "数量"], limit: ["الحد المسموح", "Max per order", "Tối đa mỗi đơn", "每单上限"], maint: ["تحت الصيانة", "Under maintenance", "Đang bảo trì", "维护中"], retry: ["إعادة المحاولة", "Try again", "Thử lại", "重试"],
    items: ["عنصر", "items", "mục", "项"], nocat: ["لا توجد أقسام بعد.", "No sections yet.", "Chưa có mục nào.", "暂无分类。"], noprod: ["لا توجد منتجات في هذا القسم.", "No products in this section.", "Không có sản phẩm trong mục này.", "此分类暂无商品。"],
    price: ["السعر", "Price", "Giá", "价格"], qty: ["العدد", "Qty", "SL", "数量"], buy: ["شراء", "Buy", "Mua", "购买"], sold: ["نفد", "Sold out", "Hết hàng", "售罄"], total: ["الإجمالي", "Total", "Tổng", "合计"],
    confirm: ["تأكيد الشراء", "Confirm purchase", "Xác nhận mua", "确认购买"], yourbal: ["رصيدك", "Your balance", "Số dư của bạn", "你的余额"], topup: ["شحن الرصيد", "Top up balance", "Nạp tiền", "充值"],
    bought: ["تم تقديم الطلب", "Order placed", "Đã đặt hàng", "下单成功"], noorders: ["لا توجد طلبات بعد.", "No orders yet.", "Chưa có đơn hàng.", "暂无订单。"],
    pay: ["محافظ الدفع", "Payment methods", "Phương thức thanh toán", "支付方式"], paynum: ["معلومات الدفع", "Payment info", "Thông tin thanh toán", "付款信息"], copy: ["نسخ", "Copy", "Sao chép", "复制"], copied: ["تم النسخ", "Copied", "Đã sao chép", "已复制"],
    amount: ["المبلغ", "Amount", "Số tiền", "金额"], pick: ["اختيار صورة إيصال الدفع", "Choose payment receipt image", "Chọn ảnh biên lai", "选择付款凭证图片"], send: ["إرسال طلب الشحن", "Submit top-up request", "Gửi yêu cầu nạp", "提交充值请求"],
    hist: ["سجل المحفظة", "Wallet history", "Lịch sử ví", "钱包记录"], nohist: ["لا توجد عمليات.", "No activity.", "Chưa có hoạt động.", "暂无记录。"],
    need: ["اختر الطريقة وأدخل المبلغ وأرفق صورة الإيصال.", "Choose a method, enter the amount and attach the receipt.", "Chọn phương thức, nhập số tiền và đính kèm biên lai.", "请选择方式、输入金额并上传凭证。"],
    topsent: ["تم إرسال طلب الشحن وسيتم مراجعته.", "Top-up request sent. It will be reviewed.", "Đã gửi yêu cầu nạp, sẽ được xem xét.", "充值请求已提交，将进行审核。"],
    nowal: ["لا توجد طرق دفع حالياً.", "No payment methods available.", "Chưa có phương thức thanh toán.", "暂无支付方式。"],
    typemsg: ["اكتب رسالتك...", "Type your message...", "Nhập tin nhắn...", "输入消息..."], sendm: ["إرسال", "Send", "Gửi", "发送"], nomsg: ["ابدأ المحادثة مع الدعم.", "Start a conversation with support.", "Bắt đầu trò chuyện với hỗ trợ.", "开始与客服对话。"],
    farms: ["المزارع", "Farms", "Nông trại", "农场"], codes: ["أكواد الاشتراك", "Subscription codes", "Mã đăng ký", "订阅码"], boxes: ["المنتجات العشوائية", "Random boxes", "Hộp ngẫu nhiên", "随机盲盒"], groups: ["المجموعات", "Groups", "Nhóm", "群组"],
    avail: ["متاحة", "available", "còn", "可购"], types: ["نوع", "types", "loại", "种"], bx: ["صندوق", "boxes", "hộp", "个盲盒"], instock: ["متوفر", "In stock", "Còn hàng", "有货"],
    nofarm: ["لا مزارع متاحة حاليًا.", "No farms available now.", "Hiện không có nông trại.", "暂无可购农场。"], nocode: ["لا أكواد حاليًا.", "No codes now.", "Hiện chưa có mã.", "暂无代码。"], nobox: ["لا صناديق حاليًا.", "No boxes now.", "Hiện chưa có hộp.", "暂无盲盒。"],
    openbox: ["افتح الصندوق", "Open box", "Mở hộp", "开启盲盒"], won: ["ربحت", "You won", "Bạn trúng", "你获得了"], ok: ["تم الطلب بنجاح", "Order placed", "Đặt hàng thành công", "下单成功"],
    farmnote: ["يتم تسليم بيانات المزرعة (ID / Token) يدويًا من الإدارة بعد الشراء.", "Farm credentials (ID / Token) are delivered manually by the admin after purchase.", "Thông tin nông trại (ID / Token) được quản trị viên giao thủ công sau khi mua.", "购买后，农场凭据（ID / Token）由管理员手动发放。"],
    waitdel: ["بانتظار تسليم الإدارة", "Waiting for admin delivery", "Chờ quản trị viên giao", "等待管理员发放"], cancel: ["إلغاء", "Cancel", "Hủy", "取消"], close: ["إغلاق", "Close", "Đóng", "关闭"],
    // settings
    settings: ["الإعدادات", "Settings", "Cài đặt", "设置"], lang: ["اللغة", "Language", "Ngôn ngữ", "语言"], notifs: ["الإشعارات", "Notifications", "Thông báo", "通知"], tone: ["نغمة الإشعار", "Notification tone", "Nhạc chuông thông báo", "通知铃声"],
    support: ["الدعم", "Support", "Hỗ trợ", "客服"], alerts: ["التنبيهات", "Alerts", "Cảnh báo", "提醒"], purchases: ["مشترياتي (المزارع)", "My purchases (farms)", "Đã mua (nông trại)", "我的购买（农场）"],
    myorders: ["طلبات المنتجات والأدوات", "Product & tool orders", "Đơn sản phẩm & công cụ", "商品与工具订单"], chkupd: ["البحث عن تحديث", "Check for update", "Kiểm tra cập nhật", "检查更新"],
    appver: ["إصدار التطبيق", "App version", "Phiên bản ứng dụng", "应用版本"], logout: ["تسجيل الخروج", "Sign out", "Đăng xuất", "退出登录"],
    logoutq: ["هل أنت متأكد أنك تريد تسجيل الخروج؟", "Are you sure you want to sign out?", "Bạn có chắc muốn đăng xuất?", "确定要退出登录吗？"],
    notifoff: ["تم إيقاف الإشعارات", "Notifications turned off", "Đã tắt thông báo", "通知已关闭"], notifon: ["تم تفعيل الإشعارات", "Notifications turned on", "Đã bật thông báo", "通知已开启"],
    latest: ["أنت على أحدث إصدار", "You are on the latest version", "Bạn đang dùng phiên bản mới nhất", "已是最新版本"], newver: ["يتوفر إصدار جديد", "New version available", "Có phiên bản mới", "发现新版本"], updnow: ["تحديث التطبيق", "Update now", "Cập nhật ngay", "立即更新"],
    checking: ["جارٍ البحث عن تحديث…", "Checking…", "Đang kiểm tra…", "检查中…"], nopurch: ["لا مشتريات بعد.", "No farm purchases yet.", "Chưa mua nông trại nào.", "还没有购买农场。"],
    nofarms: ["لا مشتريات بعد.", "No purchases yet.", "Chưa có giao dịch mua.", "暂无购买。"], noalerts: ["لا توجد تنبيهات.", "No alerts.", "Không có cảnh báo.", "暂无提醒。"], noprodorders: ["لا طلبات بعد.", "No product orders yet.", "Chưa có đơn sản phẩm.", "还没有商品订单。"], nonotif: ["لا تنبيهات.", "No notifications.", "Không có thông báo.", "暂无通知。"],
    anns: ["الإعلانات", "Announcements", "Thông báo chung", "公告"], pdate: ["تاريخ الشراء", "Purchase date", "Ngày mua", "购买日期"], odate: ["تاريخ الطلب", "Order date", "Ngày đặt", "下单日期"],
    cdata: ["بيانات المزرعة", "Farm credentials", "Thông tin nông trại", "农场凭据"], newreply: ["رد جديد من الدعم", "New reply from support", "Có phản hồi mới từ hỗ trợ", "客服有新回复"],
    readall: ["تعليم الكل كمقروء", "Mark all read", "Đánh dấu đã đọc", "全部标为已读"], status: ["الحالة", "Status", "Trạng thái", "状态"], method: ["الطريقة", "Method", "Phương thức", "方式"],
    date: ["التاريخ", "Date", "Ngày", "日期"], bafter: ["الرصيد بعد", "Balance after", "Số dư sau", "变动后余额"], timeline: ["المسار", "Timeline", "Tiến trình", "进度"], upproof: ["رفع إثبات الدفع", "Upload payment proof", "Tải chứng từ", "上传付款凭证"],
    cancelreq: ["إلغاء الطلب", "Cancel request", "Hủy yêu cầu", "取消请求"], proofup: ["تم رفع الإثبات", "Proof uploaded", "Đã tải chứng từ", "凭证已上传"], expin: ["ينتهي الطلب بعد", "Expires in", "Hết hạn sau", "剩余有效时间"], min: ["دقيقة", "min", "phút", "分钟"],
    s_tools: ["أدوات", "Tools", "Công cụ", "工具"], tones: { soft_bell: ["جرس ناعم", "Soft bell", "Chuông nhẹ", "柔和铃声"], bell: ["جرس", "Bell", "Chuông", "铃声"], marimba: ["ماريمبا", "Marimba", "Marimba", "马林巴"], harp: ["هارب", "Harp", "Đàn hạc", "竖琴"], bubble: ["فقاعة", "Bubble", "Bong bóng", "气泡"], digital: ["رقمي", "Digital", "Kỹ thuật số", "数码"], loud: ["عالٍ", "Loud", "To", "响亮"], calm: ["هادئ", "Calm", "Êm dịu", "舒缓"], ding: ["دينغ", "Ding", "Ding", "叮"], silent: ["صامت", "Silent", "Im lặng", "静音"] },
  };
  const xt = (k) => { const v = U[k]; return v ? Z(...v) : k; };
  const toneName = (t) => Z(...U.tones[t]);
  const playTone = (t) => { if (!t || t === "silent") return; try { new Audio(`/sounds/hd_${t}.wav`).play().catch(() => {}); } catch (e) {} };

  /* ---------- icons ---------- */
  const SV = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const IK = {
    shop: SV('<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/><path d="M5 12v8h14v-8"/>'),
    globe: SV('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
    bell: SV('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>'),
    music: SV('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
    head: SV('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="2"/><rect x="17" y="14" width="4" height="6" rx="2"/><path d="M19 20c0 1-2 2-5 2"/>'),
    home: SV('<path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>'),
    list: SV('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
    dl: SV('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
    out: SV('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" transform="translate(24 0) scale(-1 1)"/>'),
    chv: '<svg class="chv" viewBox="0 0 24 24" fill="none" stroke="#9b9b9b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  };
  const chvR = `<svg class="chv" viewBox="0 0 24 24" fill="none" stroke="#9b9b9b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`;
  const xsheet = (html) => { $("panel").innerHTML = html; $("sheet").classList.add("show"); };
  const closeX = () => $("sheet").classList.remove("show");

  /* ---------- banner + maintenance + ticker ---------- */
  function applyTicker() {
    const c = HD.cfg, t = $("tick"); if (!t) return;
    const txt = c && c.banner && c.banner.on ? String(c.banner.text || "").trim() : "";
    if (txt) { t.textContent = txt + "   •   " + txt; t.dataset.b = "1"; }
    else if (t.dataset.b) { delete t.dataset.b; t.textContent = S[L].tick + "   •   " + S[L].tick; }
  }
  function applyCfg() {
    const c = HD.cfg;
    if (!c) return;
    const old = document.getElementById("hdb"); if (old) old.hidden = true;
    applyTicker();
    let m = document.getElementById("hdm");
    if (!m) { m = document.createElement("div"); m.id = "hdm"; m.className = "xm"; document.body.appendChild(m); }
    if (c.maintenance.on) {
      m.hidden = false;
      m.innerHTML = `<div><div style="font-size:64px">🛠️</div><h2>${xt("maint")}</h2><p>${E(c.maintenance.message)}</p><button class="xbtn" data-x="retry">${xt("retry")}</button></div>`;
    } else m.hidden = true;
  }
  async function loadCfg() {
    const r = await api("config", {});
    if (r.ok) { HD.cfg = r; applyCfg(); if (!$("app").hidden && tab == 2 && !HD.page) paintMethods(); }
  }
  async function refreshMe() {
    if (!TOKEN) return;
    const r = await api("me", { token: TOKEN });
    if (r.ok) { ME = r; setBal(r.balances); } else if (r.error == "unauthorized") sessionOut();
  }

  /* ---------- store: admin categories ---------- */
  async function loadHome() {
    const r = await api("home", {});
    if (!r.ok) return;
    HD.rates = r.rates; HD.counts = r.counts; HD.grp = r.groups; HD.anns = r.announcements;
    if (!$("app").hidden && tab == 0 && !axe && !opt && !HD.page) drawGrid();
  }
  async function loadCat() {
    const r = await api("catalog", {});
    if (!r.ok) return;
    HD.cats = r.categories; HD.prods = r.products;
    HD.cats.forEach((c) => { c.name_ar = c.name; Object.defineProperty(c, "name", { get() { return L != "ar" && this.name_en ? this.name_en : this.name_ar; } }); });
    if (!$("app").hidden && tab == 0 && !axe && !opt && !HD.page) drawGrid();
    if ($("sheet").classList.contains("show") && HD.open) openXCat(HD.open);
  }
  async function loadOpt() {
    const r = await api("opt_items", {});
    if (!r.ok) return;
    HD.opt = r;
    const byName = new Map(r.items.map((i) => [i.n, i]));
    OPT.forEach((x) => { const it = byName.get(x.n); if (it) { x.p = it.p; x.sid = it.id; } else x.sid = -1; });
    if (opt && !ready) { drawBar(); const l = $("ol"); if (l && document.activeElement && !document.activeElement.classList.contains("qn")) drawOl(); }
  }
  const tile = (attr, emoji, name, sub, tint) => `<div class="cc" style="--t:${tint}" ${attr}><div class="pic">${emoji}</div><h3>${name}</h3><small>${sub}</small><span class="go2"></span></div>`;
  HD.favs = new Set(LSg("favs", []));
  HD.chip = "all";
  const TINTS = ["#E7F6EA", "#E6EEFC", "#FDF0E0", "#F6E8F7", "#FCE8EE"];
  function homeItems() {
    const s = S[L], c = HD.counts || {}, out = [];
    if (c.farms) out.push({ k: "farms", n: xt("farms"), e: "🧑‍🌾", sub: `${c.farms} ${xt("avail")}`, attr: 'data-x="farms"' });
    for (const x of HD.cats || []) out.push({ k: "c" + x.id, n: x.name, img: x.image, e: "🏪", sub: `${HD.prods.filter((p) => p.category_id == x.id).length} ${xt("items")}`, attr: `data-x="cat:${x.id}"`, hay: HD.prods.filter((p) => p.category_id == x.id).map((p) => p.name).join(" ") });
    if (c.opt) out.push({ k: "opt", n: s.opt, mos: 1, e: "🍽️", sub: s.cnt(OPT.length), attr: 'data-p="1"', hay: OPT.map((o) => o.n).join(" ") });
    if (c.codes) out.push({ k: "codes", n: xt("codes"), e: "🔑", sub: `${c.codes} ${xt("types")}`, attr: 'data-x="codes"' });
    if (c.boxes) out.push({ k: "boxes", n: xt("boxes"), e: "🎁", sub: `${c.boxes} ${xt("bx")}`, attr: 'data-x="boxes"' });
    if (HD.grp && HD.grp.length) out.push({ k: "groups", n: xt("groups"), e: "💬", sub: `${HD.grp.length}`, attr: 'data-x="groups"' });
    return out;
  }
  drawGrid = function () {
    const g = $("cg");
    if (!g) return;
    const q = (term || "").toLowerCase(), all = homeItems();
    const ch = $("xch");
    if (ch) ch.innerHTML = `<button class="tile ${HD.chip == "all" ? "on" : ""}" data-x="chip:all"><span>▦</span>${S[L].all}</button>` + all.map((x) => `<button class="tile ${HD.chip == x.k ? "on" : ""}" data-x="chip:${x.k}"><span>${x.img ? `<img class="xi3" src="${E(x.img)}" alt="">` : x.e}</span>${E(x.n)}</button>`).join("");
    const list = all.filter((x) => (HD.chip == "all" || HD.chip == x.k) && (!favOnly || HD.favs.has(x.k)) && (!q || x.n.toLowerCase().includes(q) || (x.hay || "").toLowerCase().includes(q)));
    g.innerHTML = list.map((x, i) => `<div class="cc" style="--t:${TINTS[i % TINTS.length]}" ${x.attr}><button class="hrt ${HD.favs.has(x.k) ? "on" : ""}" data-x="fav:${x.k}" aria-label="fav">${HD.favs.has(x.k) ? "♥" : "♡"}</button><div class="pic${x.mos ? " mos" : ""}">${x.mos ? "" : x.img ? `<img class="xi2" src="${E(x.img)}" alt="">` : x.e}</div><h3>${E(x.n)}</h3><small>${x.sub}</small></div>`).join("") || `<p class="empty" style="grid-column:1/-1">${xt("nocat")}</p>`;
    const fv = document.querySelector(".sh .fv"); if (fv) fv.innerHTML = `♥ ${S[L].fav} ${HD.favs.size}`;
  };
  function openXCat(id) {
    const c = HD.cats.find((x) => x.id == id);
    if (!c) return;
    HD.open = id;
    const ps = HD.prods.filter((p) => p.category_id == id);
    $("panel").innerHTML = `<h2>${E(c.name)}</h2>` + (ps.length ? ps.map((p) => {
      const cap = p.qty < 0 ? (p.max_order > 0 ? p.max_order : 9999) : (p.max_order > 0 ? Math.min(p.qty, p.max_order) : p.qty);
      const q = Math.min(HD.qty[p.id] || 1, Math.max(1, cap));
      return `<div class="xp">${p.image ? `<img src="${E(p.image)}" alt="">` : `<div class="xph"></div>`}<div class="xpi"><b>${E(p.name)}</b><small>${xt("qty")}: ${p.qty < 0 ? "∞" : p.qty}</small><small>${xt("pack")}: ${p.pack > 1 ? p.pack : 1}</small>${p.max_order > 0 ? `<span class="xchip">${xt("limit")}: ${p.max_order}</span>` : ""}<small>${xt("price")}: <b>${mon(p.price)}</b></small>` +
        (p.qty != 0 ? `<div class="xr"><button class="xs" data-x="q:${p.id}:-1">−</button><b>${q}</b><button class="xs" data-x="q:${p.id}:1">+</button><button class="xbtn" data-x="buy:${p.id}">${xt("buy")}</button></div>` : `<span class="xchip bad">${xt("sold")}</span>`) + `</div></div>`;
    }).join("") : `<p class="empty">${xt("noprod")}</p>`);
    $("sheet").classList.add("show");
  }

  /* ---------- confirm + purchase flow ---------- */
  function xconfirm(o) {
    if (!TOKEN) return;
    o.key = idem(); HD.cf = o;
    refreshMe().then(() => HD.cf === o && drawConfirm());
    drawConfirm();
  }
  function drawConfirm() {
    const o = HD.cf; if (!o) return;
    const tot = cv(o.usdt), have = bal(), low = have < tot;
    xsheet(`<h2>${E(o.title)}</h2>${o.lines ? `<div class="xmut">${o.lines}</div>` : ""}${typeof o.extra == "function" ? o.extra() : o.extra || ""}
      <div class="xr" style="margin:8px 0">${CURS.map((c) => `<button class="xchip ${c == HD.cur ? "on" : ""}" data-x="cc:${c}">${c}</button>`).join("")}</div>
      <div class="line"><span>${xt("total")}</span><b>${amt(tot)}</b></div><div class="line"><span>${xt("yourbal")}</span><span>${amt(have)}</span></div><div id="xerr"></div>
      ${low ? `<div class="xerr">${emsg({ error: "insufficient_balance" })}</div><button class="go" data-x="gotop"><span>${xt("topup")}</span></button>` : `<button class="go" id="xgo" data-x="dobuy"><span>${xt("confirm")}</span></button>`}
      <button class="go" style="margin-top:10px;background:var(--field);color:var(--ink);box-shadow:none" data-x="closex"><span>${xt("cancel")}</span></button>`);
  }
  async function doBuy() {
    const o = HD.cf, b = $("xgo"); if (!o || !b) return;
    b.disabled = true;
    try { await o.run(HD.cur, o.key); }
    catch (r) { const e = $("xerr"); if (e) e.innerHTML = `<div class="xerr">${E(emsg(r))}</div>`; b.disabled = false; }
  }
  function done(order, prize) {
    HD.cf = null;
    xsheet(`<div class="xdone"><div class="big">${prize ? "🎁" : "✅"}</div><h2>${xt("ok")}</h2>${prize ? `<div class="xmut">${xt("won")}</div><div class="pz">${E(prize)}</div>` : ""}<div class="xmut">#${order.id} · ${amt(order.total, order.currency)}</div>
      ${order.delivery ? `<div class="xcode">${E(order.delivery)}</div><button class="xbtn" data-x="copyv">${xt("copy")}</button>` : order.kind == "farm" ? `<div class="xmut">${xt("farmnote")}</div>` : ""}
      <button class="go" style="margin-top:14px" data-x="closex"><span>${xt("close")}</span></button></div>`);
    HD.copyv = order.delivery || "";
  }
  async function purchase(name, body, prizeOf) {
    const r = await call(name, body);
    if (!r.ok) throw r;
    setBal(r.balances); done(r.order, prizeOf ? prizeOf(r.order) : null);
    loadCat(); loadHome(); loadOpt();
    return r;
  }
  function buy(id) {
    const p = HD.prods.find((x) => x.id == id);
    if (!p) return;
    const cap = p.qty < 0 ? (p.max_order > 0 ? p.max_order : 9999) : (p.max_order > 0 ? Math.min(p.qty, p.max_order) : p.qty);
    const q = Math.min(HD.qty[id] || 1, cap);
    const o = { title: p.name, lines: `${xt("qty")}: ${q}`, usdt: p.price * q, tag: "", cap: "" };
    if (p.need_tag) o.extra = () => `<div class="xtg"><label>${xt("ftag")}</label><input class="xin" id="xtag" dir="ltr" maxlength="16" placeholder="#ABC123" autocomplete="off" value="${E(o.tag)}"><label>${xt("fcap")}</label><input class="xin" id="xcap" type="number" inputmode="numeric" min="1" placeholder="${xt("fcap")}" value="${E(o.cap)}"></div>`;
    o.run = (cur, key) => {
      const tag = String(o.tag || "").toUpperCase().replace(/^#/, "").trim(), c = Math.floor(Number(o.cap)) || 0;
      if (p.need_tag && (!/^[0-9A-Z]{3,15}$/.test(tag) || c < 1)) return Promise.reject({ error: "tag_required" });
      return purchase("checkout", { kind: "cart", lines: [{ id: p.id, q }], currency: cur, idem_key: key, tag: p.need_tag ? tag : undefined, cap: p.need_tag ? c : undefined });
    };
    xconfirm(o);
  }
  confirmOpt = function () {
    const s = S[L], m = sums();
    if (!m.c) return toast(s.needsel);
    const items = OPT.filter((x) => qty[x.id] && x.sid >= 0);
    if (!items.length) return toast(s.needsel);
    const usdt = items.reduce((a, x) => a + x.p * qty[x.id], 0);
    xconfirm({ title: s.opt, lines: items.slice(0, 10).map((x) => `${E(x.n)} × ${qty[x.id]}`).join("<br>") + (items.length > 10 ? `<br>… +${items.length - 10}` : ""), usdt,
      run: async (cur, key) => { const lines = items.map((x) => ({ id: x.sid, q: qty[x.id] })); const r = await purchase("checkout", { kind: "opt", lines, currency: cur, idem_key: key }); qty = {}; if (opt) drawOpt(); return r; } });
  };

  /* ---------- farms / codes / boxes / groups ---------- */
  async function openFarms() {
    xsheet(`<h2>${xt("farms")}</h2><div class="empty"><div class="xr" style="justify-content:center">…</div></div>`);
    const r = await api("farms", {}); if (!r.ok) return closeX();
    HD.farms = r.farms;
    xsheet(`<h2>${xt("farms")}</h2>` + (r.farms.length ? r.farms.map((f) => `<div class="xp">${f.image ? `<img src="${E(f.image)}" alt="">` : `<div class="xph"></div>`}<div class="xpi"><b>${E(f.name)}</b><small>Lv ${f.level}${f.descr ? " · " + E(f.descr) : ""}</small><div class="xr"><b>${mon(f.price)}</b><button class="xbtn" data-x="farmbuy:${f.id}">${xt("buy")}</button></div></div></div>`).join("") + `<p class="xmut" style="margin-top:10px">${xt("farmnote")}</p>` : `<p class="empty">${xt("nofarm")}</p>`));
  }
  async function openCodes() {
    const r = await api("codes", {}); if (!r.ok) return;
    HD.codes = r.codes;
    xsheet(`<h2>${xt("codes")}</h2>` + (r.codes.length ? r.codes.map((c) => { const q = Math.min(HD.cq[c.id] || 1, Math.max(1, Math.min(10, c.stock))); return `<div class="xp">${c.image ? `<img src="${E(c.image)}" alt="">` : `<div class="xph"></div>`}<div class="xpi"><b>${E(c.name)}</b><small>${E(c.descr)}</small><div><b>${mon(c.price)}</b> ${c.stock > 0 ? `<span class="xchip st-done">${xt("instock")} ${c.stock}</span>` : `<span class="xchip bad">${xt("sold")}</span>`}</div>${c.stock > 0 ? `<div class="xr"><button class="xs" data-x="cq:${c.id}:-1">−</button><b>${q}</b><button class="xs" data-x="cq:${c.id}:1">+</button><button class="xbtn" data-x="codebuy:${c.id}">${xt("buy")}</button></div>` : ""}</div></div>`; }).join("") : `<p class="empty">${xt("nocode")}</p>`));
  }
  async function openBoxes() {
    const r = await api("boxes", {}); if (!r.ok) return;
    HD.boxes = r.boxes;
    xsheet(`<h2>${xt("boxes")}</h2>` + (r.boxes.length ? r.boxes.map((b) => `<div class="xp">${b.image ? `<img src="${E(b.image)}" alt="">` : `<div class="xph"></div>`}<div class="xpi"><b>${E(b.name)}</b><small>${E(b.descr)}</small><div>${b.prizes.map((p) => `<span class="xchip">${E(p)}</span>`).join("")}</div><div class="xr"><b>${mon(b.price)}</b><button class="xbtn" data-x="boxbuy:${b.id}">${xt("openbox")}</button></div></div></div>`).join("") : `<p class="empty">${xt("nobox")}</p>`));
  }
  function openGroups() {
    xsheet(`<h2>${xt("groups")}</h2>` + HD.grp.map((g) => `<a class="xp" href="${E(g.url)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">${g.image ? `<img src="${E(g.image)}" alt="">` : `<div class="xph"></div>`}<div class="xpi"><b>${E(g.name)}</b><small>${E(g.descr)}</small></div></a>`).join(""));
  }

  /* ---------- orders tab ---------- */
  async function loadOrders() {
    const r = await call("orders", {});
    if (r.ok) HD.orders = r.orders;
    paintOrders();
  }
  const ordCard = (o) => {
    const lines = (o.lines || []).map((l) => `<div class="xr sp"><span>${E(l.n)} × ${l.q}</span>${l.prize ? `<b>🎁 ${E(l.prize)}</b>` : ""}</div>`).join("");
    return `<div class="xc"><div class="xr sp"><b>#${o.id} · ${E(o.name)}</b>${stChip(o.status)}</div><small>${E(Z(...(KIND[o.kind] || [o.kind, o.kind, o.kind, o.kind])))} · ${xt("total")}: ${amt(o.total, o.currency)} · ${fdate(o.created_at)}</small>${o.farm_tag ? `<small dir="ltr" style="text-align:start">Tag: #${E(o.farm_tag)} · ${xt("fcap")}: ${o.farm_cap}</small>` : ""}${lines}` +
      (o.delivery ? `<div class="xcode">${E(o.delivery)}</div><button class="xbtn" data-x="copyo:${o.id}">${xt("copy")}</button>` : o.kind == "farm" && !["done", "cancelled"].includes(o.status) ? `<small>${xt("waitdel")}</small>` : "") + `</div>`;
  };
  function paintOrders() {
    const el = $("xol");
    if (!el) return;
    el.innerHTML = (HD.orders || []).length ? HD.orders.map(ordCard).join("") : `<p class="empty">${xt("noorders")}</p>`;
  }

  /* ---------- wallet / top-up ---------- */
  function paintMethods() {
    const el = $("xw");
    if (!el) return;
    const ms = (HD.cfg && HD.cfg.methods) || [];
    el.innerHTML = ms.length ? ms.map((w) => `<div class="xw ${HD.sel == w.id ? "on" : ""}" data-x="sel:${w.id}">${iconFor(w.name, w.currency, w.icon)}<div class="xwi"><b>${E(w.name)}</b>${w.info ? `<small>${xt("paynum")}: <bdi dir="ltr">${E(w.info)}</bdi></small>` : ""}${w.instructions ? `<small>${E(w.instructions)}</small>` : ""}</div>${w.info ? `<button class="xbtn" data-x="copym:${w.id}">${xt("copy")}</button>` : ""}</div>`).join("") : `<p class="empty">${xt("nowal")}</p>`;
    paintInfo();
    const m = ms.find((x) => x.id == HD.sel), a = $("xamt");
    if (a) a.placeholder = m ? `${xt("amount")} (${m.currency})${m.min_amount ? " · min " + m.min_amount : ""}${m.max_amount ? " · max " + m.max_amount : ""}` : xt("amount");
  }
  /* ---------- currency / payment-method icons (automatic) ---------- */
  const CN = { JOD: ["دينار أردني", "Jordanian dinar", "Dinar Jordan", "约旦第纳尔"], IQD: ["دينار عراقي", "Iraqi dinar", "Dinar Iraq", "伊拉克第纳尔"], USDT: ["تيثر", "Tether", "Tether", "泰达币"] };
  const curName = (c) => (CN[c] ? Z(...CN[c]) : c);
  const hue = (str) => { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const SVGI = {
    usdt: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="#26A17B"/><path fill="#fff" d="M26.4 22.2v-3.1h6.2v-4.2H15.4v4.2h6.2v3.1c-5 .2-8.800 1.200-8.800 2.400s3.800 2.200 8.800 2.400v8.600h4.800v-8.600c5-.2 8.800-1.200 8.800-2.400s-3.800-2.200-8.800-2.400zm0 4.100v0c-.1 0-.7 0-2.400 0s-2.300 0-2.400 0v0c-4.300-.2-7.500-.9-7.500-1.800s3.200-1.600 7.500-1.800v2.900c.1 0 .8.100 2.400.1 2 0 2.400-.1 2.400-.1v-2.900c4.300.2 7.500.9 7.500 1.800s-3.200 1.600-7.500 1.800z"/></svg>',
    mc: '<svg viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#fff"/><circle cx="18" cy="24" r="11" fill="#EB001B"/><circle cx="30" cy="24" r="11" fill="#F79E1B"/><path d="M24 15.100a11 11 0 0 1 0 17.800 11 11 0 0 1 0-17.800z" fill="#FF5F00"/></svg>'
  };
  const brandOf = (name, cur) => { const n = String(name || "").toLowerCase(); if (/usdt|tether|تيثر/.test(n) || cur === "USDT") return "usdt"; if (/master|ماستر/.test(n)) return "mc"; return ""; };
  const badge = (code) => /^(JOD|IQD)$/.test(code) ? `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="#E8A900"/><text x="24" y="32" text-anchor="middle" font-size="26" font-weight="800" fill="#141414" font-family="Cairo,Arial,sans-serif">د</text></svg>` : `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="hsl(${hue(code)},55%,42%)"/><text x="24" y="30" text-anchor="middle" font-size="17" font-weight="800" fill="#fff" font-family="Arial,sans-serif">${E(String(code).slice(0, 3).toUpperCase())}</text></svg>`;
  const iconFor = (name, cur, img, size = 46) => {
    const b = brandOf(name, cur);
    const inner = img ? `<img src="${E(img)}" alt="">` : b ? SVGI[b] : badge(cur || String(name).slice(0, 2));
    return `<span class="xbi" style="width:${size}px;height:${size}px">${inner}</span>`;
  };
  const curIcon = (c, size = 22) => iconFor(c, c, "", size);
  const walCurs = () => { const ms = (HD.cfg && HD.cfg.methods) || []; const u = [...new Set(ms.map((m) => m.currency).filter((c) => CURS.includes(c)))]; return u.length ? u : CURS; };
  const walMethod = () => { const ms = (HD.cfg && HD.cfg.methods) || []; return ms.find((x) => x.id == HD.sel && x.currency == HD.cur) || ms.find((x) => x.currency == HD.cur); };
  function openCurSheet() {
    const ms = (HD.cfg && HD.cfg.methods) || [], cur = walMethod();
    $("panel").innerHTML = `<h2>${Z("اعرض رصيدك بعملة", "Show your balance in", "Xem số dư bằng", "以此币种显示余额")}</h2><div class="cwl">` + ms.map((m) => `<div class="cw" data-x="wpick:${m.id}">${iconFor(m.name, m.currency, m.icon, 44)}<div class="cwi"><b>${E(m.name)}</b><small><bdi dir="ltr">${nf(bal(m.currency), m.currency)} ${m.currency}${m.currency == "USDT" ? "" : " · 1 USDT = " + nf(rate(m.currency), m.currency) + " " + m.currency}</bdi></small></div>${rad(cur && cur.id == m.id)}</div>`).join("") + `</div>`;
    $("sheet").classList.add("show");
  }
  const usdtOf = (v, c) => Number(v || 0) / rate(c);
  const u4 = (v) => Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  function paintInfo() {
    const ms = (HD.cfg && HD.cfg.methods) || [], m = ms.find((x) => x.id == HD.sel) || ms[0];
    const i1 = $("xi1"), i2 = $("xi2");
    if (!m) { if (i1) i1.innerHTML = ""; if (i2) i2.innerHTML = ""; return; }
    const a = parseFloat(($("xamt") || {}).value) || 0;
    if (i1) i1.innerHTML = `<div class="xinfo">${iconFor(m.name, m.currency, m.icon, 22)}<span><bdi dir="ltr">${u4(usdtOf(bal(m.currency), m.currency))} USDT</bdi> · ${E(m.name)}</span></div>`;
    if (i2) i2.innerHTML = `<div class="xinfo">${curIcon(m.currency)}<span>≈ <bdi dir="ltr">${u4(usdtOf(a, m.currency))} USDT</bdi> · ${E(curName(m.currency))} (${E(m.currency)})</span></div>`;
  }
  const histRow = (x) => `<div class="xc" data-x="tx:${E(x.txn_id)}" style="cursor:pointer"><div class="xr sp"><b>${E(x.title || Z(...(TT[x.type] || [x.type, x.type, x.type, x.type])))}</b><b dir="ltr" style="color:${x.amount < 0 ? "#b71c1c" : "#1b6b1b"}">${x.amount > 0 ? "+" : ""}${nf(x.amount, x.currency)} ${x.currency}</b></div><small>${E(Z(...(TT[x.type] || [x.type, x.type, x.type, x.type])))} · ${fdate(x.created_at)}</small>${x.kind == "deposit" ? stChip(x.status) : ""}</div>`;
  async function loadWalletData() {
    await refreshMe();
    const r = await call("wallet_history", {});
    const el = $("xh"); if (r.ok && el) { HD.hist = r.items; el.innerHTML = r.items.length ? r.items.map(histRow).join("") : `<p class="empty">${xt("nohist")}</p>`; }
  }
  function drawWallet() {
    $("view").innerHTML = wallet() + `<div class="pad"><h2>${xt("pay")}</h2><div id="xw"></div><div id="xi1"></div><h2 style="margin-top:18px">${xt("topup")}</h2>
      <input class="xin" id="xamt" inputmode="decimal" placeholder="${xt("amount")}" autocomplete="off"><div id="xi2"></div>
      <label class="xfile"><input type="file" id="xrc" accept="image/*" hidden>${xt("pick")}</label>
      <img id="xrp" class="xrp" alt="" hidden>
      <button class="go" data-x="topup"><span>${xt("send")}</span></button>
      <h2 style="margin-top:22px">${xt("hist")}</h2><div id="xh"></div></div>`;
    HD.rc = null; paintMethods(); loadWalletData(); loadCfg();
  }
  function resizeImg(file, cb) {
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 900 / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        let d = "";
        for (const q of [0.7, 0.5, 0.35, 0.2]) { d = c.toDataURL("image/jpeg", q); if (d.length < 440000) break; }
        cb(d.length < 450000 ? d : null);
      };
      im.onerror = () => cb(null);
      im.src = r.result;
    };
    r.onerror = () => cb(null);
    r.readAsDataURL(file);
  }
  async function submitTopup() {
    const a = parseFloat(String($("xamt").value).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632).replace(",", "."));
    const m = ((HD.cfg && HD.cfg.methods) || []).find((x) => x.id == HD.sel);
    if (!m || !HD.rc || !(a > 0)) return toast(xt("need"));
    HD.dkey = HD.dkey || idem();
    const d = await call("deposit_create", { method_id: m.id, amount: a, idem_key: HD.dkey });
    if (!d.ok) return toast(emsg(d) + (d.min ? ` (${d.min}–${d.max || "∞"})` : ""));
    const p = await call("deposit_proof", { order_id: d.order.id, proof: HD.rc });
    HD.dkey = null;
    if (p.ok) { toast(xt("topsent")); HD.rc = null; $("xamt").value = ""; $("xrp").hidden = true; loadWalletData(); } else toast(emsg(p));
  }
  async function openTx(id) {
    const r = await call("transaction_get", { txn_id: id });
    if (!r.ok) return toast(emsg(r));
    if (r.kind == "deposit") {
      const o = r.order, left = o.expires_at - Math.floor(Date.now() / 1000);
      xsheet(`<h2>${E(o.txn_id)}</h2><div class="line"><span>${xt("status")}</span>${stChip(o.status)}</div><div class="line"><span>${xt("method")}</span><b>${E(o.method_name)}</b></div><div class="line"><span>${xt("amount")}</span><b>${amt(o.amount, o.currency)}</b></div>
        ${o.credit_amount != null ? `<div class="line"><span>${Z("أُضيف للرصيد", "Credited", "Đã cộng", "已到账")}</span><b>${amt(o.credit_amount, o.currency)}</b></div>` : ""}${o.balance_after != null ? `<div class="line"><span>${xt("bafter")}</span><b>${amt(o.balance_after, o.currency)}</b></div>` : ""}
        <div class="line"><span>${xt("date")}</span><span>${fdate(o.created_at)}</span></div>${o.reject_reason ? `<div class="xerr">${E(o.reject_reason)}</div>` : ""}
        ${o.status == "awaiting_payment" ? `<p class="xmut">${xt("expin")} ${Math.max(0, Math.ceil(left / 60))} ${xt("min")}</p><label class="xfile"><input type="file" id="xtp" data-oid="${o.id}" data-tid="${E(o.txn_id)}" accept="image/*" hidden>${xt("upproof")}</label><button class="go" style="background:var(--field);color:var(--ink);box-shadow:none" data-x="canceldep:${o.id}"><span>${xt("cancelreq")}</span></button><div id="xerr"></div>` : ""}
        ${r.proof ? `<img src="${E(r.proof)}" class="xrp" alt="">` : ""}<h2 style="margin-top:12px">${xt("timeline")}</h2>${r.history.map((h) => `<div class="xtn"><span>${E(Z(...((ST[h.to_status] || [h.to_status, h.to_status, h.to_status, h.to_status]).slice(0, 4))))}</span><small>${fdate(h.created_at)}</small></div>`).join("")}`);
    } else {
      const t = r.txn;
      xsheet(`<h2>${E(t.txn_id)}</h2><div class="line"><span>${xt("method")}</span><b>${E(Z(...(TT[t.type] || [t.type, t.type, t.type, t.type])))}</b></div><div class="line"><span>${xt("amount")}</span><b dir="ltr">${amt(t.amount, t.currency)}</b></div><div class="line"><span>${Z("الرصيد قبل", "Before", "Trước", "之前")}</span><span>${amt(t.balance_before, t.currency)}</span></div><div class="line"><span>${xt("bafter")}</span><span>${amt(t.balance_after, t.currency)}</span></div><div class="line"><span>${xt("date")}</span><span>${fdate(t.created_at)}</span></div>${t.note ? `<p class="xmut">${E(t.note)}</p>` : ""}`);
    }
  }
  function copyText(t, btn) {
    const done = () => { if (btn) { const o = btn.textContent; btn.textContent = xt("copied"); setTimeout(() => (btn.textContent = o), 1400); } else toast(xt("copied")); };
    const fallback = () => { const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); done(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
  }
  const GOLDW = '<svg viewBox="0 0 48 48" width="42" height="42"><rect x="6" y="12" width="36" height="26" rx="7" fill="#F5B400"/><path d="M12 12l22-6c2-.5 4 1 4 3v3" fill="#E8A900"/><rect x="28" y="21" width="18" height="11" rx="5.500" fill="#F5B400" stroke="#141414" stroke-width="2"/><circle cx="35" cy="26.500" r="2.200" fill="#141414"/></svg>';
  wallet = function () {
    const s = S[L];
    return `<div class="wal xw2"><div class="wic">${GOLDW}</div><div class="wi"><small>${s.bal}</small><div class="wr"><b>${nf(bal(), HD.cur)}</b><span class="cur" data-x="curnext" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">${walMethod() ? iconFor(walMethod().name, HD.cur, walMethod().icon, 24) : curIcon(HD.cur, 24)}${HD.cur} ▾</span></div></div><button class="tp" data-x="top"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-inline-end:6px"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12.500h5"/></svg>${s.top}</button><div class="wq">≈ <bdi dir="ltr">USDT ${u4(usdtOf(bal(), HD.cur))}</bdi> · ${E(walMethod() ? walMethod().name : curName(HD.cur) + " (" + HD.cur + ")")}</div></div>`;
  };

  /* ---------- support chat ---------- */
  function paintChat(force) {
    const el = $("xlist");
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    el.innerHTML = HD.msgs.length ? HD.msgs.map((m) => `<div class="xmg ${m.sender == "user" ? "me" : "ad"}">${E(m.body)}<small>${new Date(m.created_at * 1000).toLocaleTimeString(LOC[L], { hour: "2-digit", minute: "2-digit" })}</small></div>`).join("") : `<p class="empty">${xt("nomsg")}</p>`;
    if (force || bottom) el.scrollTop = el.scrollHeight;
  }
  async function loadChat(force) {
    const r = await call("support_list", {});
    if (r.ok) { HD.msgs = r.messages; paintChat(force); HD.sup = 0; drawBadges(); }
  }
  function drawChat() {
    $("view").innerHTML = `<div class="pad"><h2>${S[L].nav[tab]}</h2><div class="xchat" id="xlist"></div><div class="xr" style="flex-wrap:nowrap"><input class="xin" id="xmsg" maxlength="1000" placeholder="${xt("typemsg")}" autocomplete="off" style="margin:0"><button class="xbtn" data-x="send" style="height:50px">${xt("sendm")}</button></div></div>`;
    paintChat(true); loadChat(true);
  }
  async function sendMsg() {
    const i = $("xmsg"), body = i.value.trim();
    if (!body) return;
    i.value = "";
    const r = await call("support_send", { body });
    if (r.ok) loadChat(true); else { i.value = body; toast(emsg(r)); }
  }


  /* ---------- smart assistant (server-driven: flow, FAQ and products come from the admin panel) ---------- */
  const BOT = SV('<rect x="5" y="8" width="14" height="11" rx="3.5"/><path d="M12 8V5"/><circle cx="12" cy="4" r="1"/><circle cx="9.5" cy="13" r="1" fill="currentColor"/><circle cx="14.5" cy="13" r="1" fill="currentColor"/><path d="M9.5 16.2h5"/><path d="M3 12v3M21 12v3"/>');
  IK.bot = BOT;
  HD.ai = { items: [], opts: [], input: null, vars: {}, started: false, lang: "", busy: false, home: true, support: false, go: [] };
  const aiLang = () => (L == "ar" ? "ar" : "en");
  const aiTitle = () => Z("المساعد الذكي", "Smart Assistant", "Trợ lý thông minh", "智能助手");
  const aiOn = () => !!(HD.cfg && HD.cfg.ai && HD.cfg.ai.on);
  const aiCss = document.createElement("style");
  aiCss.textContent = ".aiw{display:flex;flex-direction:column;min-height:calc(100vh - 330px)}.ail{display:flex;flex-direction:column;gap:10px;padding:6px 0 10px}" +
    ".aib,.aiu{max-width:86%;padding:11px 14px;border-radius:18px;font-weight:600;font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word}" +
    ".aib{align-self:flex-start;background:var(--card);border:1px solid #DDD0FB;border-top-right-radius:6px}.aiu{align-self:flex-end;background:linear-gradient(135deg,#8B5CF6,#6D3FE0);color:#fff;border-top-left-radius:6px}" +
    ".aio{display:flex;flex-wrap:wrap;gap:8px;padding:4px 0 12px}.aoc{border:1.5px solid #8B5CF6;background:var(--card);color:#6D3FE0;border-radius:99px;padding:10px 16px;font:700 15px inherit;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px}" +
    ".aoc:active{background:#EFE8FE}.aoc.hm{border-style:dashed;color:var(--mute);border-color:#C9B6F7}.aoc.sp{background:#8B5CF6;color:#fff;border-color:#8B5CF6}" +
    ".air{align-self:stretch;background:var(--card);border:1px solid #DDD0FB;border-radius:18px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}" +
    ".air .rt{display:flex;align-items:center;justify-content:space-between;gap:10px}.air .rt b{font-size:16px}.air .rp{font-weight:900;color:#5B2FCB;background:#EFE8FE;border-radius:99px;padding:3px 12px;white-space:nowrap;direction:ltr}" +
    ".air small{color:var(--mute);font-weight:600}.air .rg{align-self:flex-start;border:0;background:#8B5CF6;color:#fff;border-radius:99px;padding:8px 16px;font:800 14px inherit;font-family:inherit;cursor:pointer}" +
    ".aiin{position:sticky;bottom:150px;background:var(--bg);padding:8px 0;gap:8px;flex-wrap:nowrap;align-items:center}.aiin .xin{margin:0;flex:1}.aiin .xin:focus{border-color:#8B5CF6;outline:0}.aiin .xbtn{background:#8B5CF6;color:#fff}" +
    ".aifab{position:fixed;z-index:30;bottom:150px;inset-inline-start:max(14px,calc(50% - 206px));width:56px;height:56px;border-radius:50%;border:0;background:linear-gradient(135deg,#8B5CF6,#6D3FE0);color:#fff;display:grid;place-items:center;box-shadow:0 8px 22px rgba(109,63,224,.45);cursor:pointer}" +
    ".aifab svg{width:30px;height:30px}.aity{opacity:.6}";
  document.head.appendChild(aiCss);
  function aiFab() {
    document.querySelectorAll(".aifab").forEach((e) => e.remove());
    if (!TOKEN || $("app").hidden || tab != 0 || HD.page || axe || opt || !aiOn()) return;
    const b = document.createElement("button");
    b.className = "aifab"; b.dataset.x = "aiopen"; b.setAttribute("aria-label", aiTitle()); b.innerHTML = BOT;
    $("app").appendChild(b);
  }
  const _lcfg = loadCfg;
  loadCfg = async function () { await _lcfg(); aiFab(); };
  function aiApply(r) {
    const A = HD.ai;
    A.opts = r.options || []; A.input = r.input || null; A.vars = r.vars || {}; A.support = !!r.support;
    (r.messages || []).forEach((m, i, a) => A.items.push({ who: "bot", text: m, results: i == a.length - 1 ? r.results || [] : [] }));
    if (!(r.messages || []).length && (r.results || []).length) A.items.push({ who: "bot", text: "", results: r.results });
  }
  async function aiStart() {
    const A = HD.ai; A.items = []; A.opts = []; A.vars = {}; A.input = null; A.lang = aiLang(); A.started = true; A.busy = true; paintAi();
    const r = await call("ai_open", { lang: A.lang });
    A.busy = false;
    if (r.ok && r.on) { aiApply(r); A.home = true; }
    else { A.started = false; if (r.ok) { HD.cfg = HD.cfg || {}; HD.cfg.ai = { on: false }; } toast(r.ok ? Z("المساعد غير متاح حاليًا.", "The assistant is currently unavailable.", "Trợ lý hiện không khả dụng.", "助手暂不可用。") : emsg(r)); aiBack(); return; }
    paintAi();
  }
  function paintAi() {
    const A = HD.ai, list = $("ailist"); if (!list) return;
    A.go = [];
    const pr = (n) => String(Math.round(n * 10000) / 10000);
    list.innerHTML = A.items.map((m) => m.who == "user" ? `<div class="aiu">${E(m.text)}</div>` :
      (m.text ? `<div class="aib">${E(m.text)}</div>` : "") + (m.results || []).map((x) => { A.go.push(x.go); return `<div class="air"><div class="rt"><b>${E(x.name)}</b><span class="rp">${pr(x.price)} USDT</span></div>${x.descr ? `<small>${E(x.descr)}</small>` : ""}<small>${x.level ? Z("المستوى", "Level", "Cấp", "等级") + " " + x.level + " · " : ""}${x.stock < 0 ? Z("متاح", "Available", "Còn hàng", "有货") : Z("المخزون", "Stock", "Tồn kho", "库存") + ": " + x.stock}</small><button class="rg" data-x="aigo:${A.go.length - 1}">${Z("عرض في المتجر", "View in store", "Xem trong cửa hàng", "在商店查看")}</button></div>`; }).join("")).join("") +
      (A.busy ? `<div class="aib aity">…</div>` : "");
    const o = $("aiopts");
    o.innerHTML = A.busy ? "" : A.opts.map((x) => `<button class="aoc" data-x="aiopt:${x.id}">${x.icon ? E(x.icon) + " " : ""}${E(x.label)}</button>`).join("") +
      (A.support ? `<button class="aoc sp" data-x="gosup">🎧 ${Z("التواصل مع الدعم", "Contact support", "Liên hệ hỗ trợ", "联系客服")}</button>` : "") +
      (A.items.length > 1 || A.opts.length == 0 ? `<button class="aoc hm" data-x="aiopt:0">🏠 ${Z("القائمة الرئيسية", "Main menu", "Menu chính", "主菜单")}</button>` : "");
    const q = $("aiq");
    if (q) q.placeholder = A.input && A.input.key == "level" ? Z("اكتب رقم المستوى…", "Type the level number…", "Nhập cấp độ…", "输入等级…") : A.input && A.input.key == "budget" ? Z("اكتب ميزانيتك بالـ USDT…", "Type your budget in USDT…", "Nhập ngân sách USDT…", "输入预算(USDT)…") : Z("اكتب سؤالك هنا…", "Type your question…", "Nhập câu hỏi…", "输入您的问题…");
    scrollTo(0, document.body.scrollHeight);
  }
  function drawAi() {
    $("view").innerHTML = `<div class="oh"><button class="bk" data-x="aiback" aria-label="back"></button><h2>🤖 ${aiTitle()}</h2></div><div class="pad aiw"><div class="ail" id="ailist"></div><div class="aio" id="aiopts"></div><div class="xr aiin"><input class="xin" id="aiq" maxlength="300" autocomplete="off"><button class="xbtn" data-x="aisend">${Z("إرسال", "Send", "Gửi", "发送")}</button></div></div>`;
    if (!HD.ai.started || HD.ai.lang != aiLang()) aiStart(); else paintAi();
  }
  function aiBack() { tab = HD.aiFrom || 0; HD.page = null; drawShop(); scrollTo(0, 0); }
  function aiOpen() { if (tab != 5 || HD.page != "ai") HD.aiFrom = tab == 5 ? 0 : tab; tab = 5; HD.page = "ai"; drawShop(); scrollTo(0, 0); }
  async function aiSend(text, node, label) {
    const A = HD.ai; if (A.busy) return;
    A.items.push({ who: "user", text: label || text }); A.busy = true; paintAi();
    const r = label ? await call("ai_step", { node, vars: A.vars, lang: aiLang() }) : await call("ai_ask", { text, node: A.input ? A.input.node : 0, vars: A.vars, lang: aiLang() });
    A.busy = false;
    if (!$("ailist")) return;
    if (r.ok) aiApply(r); else { if (r.error == "off") { toast(Z("المساعد غير متاح حاليًا.", "The assistant is currently unavailable.", "Trợ lý hiện không khả dụng.", "助手暂不可用。")); return aiBack(); } toast(emsg(r)); }
    paintAi();
  }
  function aiGo(sel) { tab = 0; HD.page = null; drawShop(); scrollTo(0, 0); setTimeout(() => { const el = document.querySelector(sel); if (el) el.click(); }, 150); }

  /* ---------- account: settings entry + sub pages ---------- */
  const row = (icon, label, val, x, extra) => `<button class="sr" data-x="${x}"><span class="si">${icon}</span><span class="sl">${label}</span>${extra || `<span class="sv">${val ? E(val) : ""}${chvR}</span>`}</button>`;
  const subHead = (title, back) => `<div class="oh"><button class="bk" data-x="back:${back}" aria-label="back"></button><h2>${title}</h2></div>`;
  const settingsHTML = () => `<div class="sh2">${xt("settings")}</div>
      <div class="sg">${row(IK.globe, xt("lang"), T[L].n, "langsheet")}
      <button class="sr" data-x="notiftoggle"><span class="si">${IK.bell}</span><span class="sl">${xt("notifs")}</span><span class="sw ${HD.notif ? "on" : ""}" id="nsw"></span></button>
      <div id="trow" style="${HD.notif ? "" : "opacity:.45"}">${row(IK.music, xt("tone"), toneName(HD.tone), "tonesheet")}</div></div>
      <div class="sg">${row(IK.head, xt("support"), "", "gosup", HD.sup ? `<span class="sv"><span class="xchip bad">${HD.sup}</span>${chvR}</span>` : "")}
      ${row(IK.bell, xt("alerts"), "", "alerts", HD.unread ? `<span class="sv"><span class="xchip bad">${HD.unread}</span>${chvR}</span>` : "")}
      ${aiOn() ? row(IK.bot, "🤖 " + aiTitle(), "", "aiopen") : ""}${row(IK.home, xt("purchases"), "", "myfarms")}${row(IK.list, xt("myorders"), "", "myorders")}</div>
      <div class="sg">${row(IK.dl, xt("chkupd"), APP_VER, "chkupd")}</div>
      <div class="sg"><button class="sr red" data-x="logoutask"><span class="si">${IK.out}</span><span class="sl">${xt("logout")}</span></button></div>`;
  function drawSettings() { HD.page = null; drawShop(); }
  const rad = (on) => `<span class="rd ${on ? "on" : ""}">${on ? '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : ""}</span>`;
  function drawPick(p) {
    const items = p == "lang" ? LI.map((k) => [k, T[k].n, "setl:" + k, k == L]) : TONES.map((t) => [t, toneName(t), "settone:" + t, t == HD.tone]);
    const ic = p == "lang" ? IK.globe : IK.music;
    $("view").innerHTML = subHead(xt(p == "lang" ? "lang" : "tone"), "acct") + `<div class="pad" style="padding-top:16px"><div class="sg" style="margin-top:0">${items.map((x) => p == "lang" ? `<button class="sr lgr" data-x="${x[2]}">${rad(x[3])}<span class="sl">${E(x[1])}</span></button>` : `<button class="sr" data-x="${x[2]}"><span class="si">${ic}</span><span class="sl">${E(x[1])}</span>${rad(x[3])}</button>`).join("")}</div></div>`;
  }
  function subList(title, back, id) {
    $("view").innerHTML = subHead(title, back) + `<div class="pad" style="padding-top:8px" id="${id}"></div>`;
  }
  async function drawFarmsPage() {
    subList(xt("purchases"), "acct", "xpg");
    const r = await call("orders", {}); const el = $("xpg"); if (!r.ok || !el) return;
    const f = r.orders.filter((o) => o.kind == "farm");
    el.innerHTML = f.length ? f.map((o) => `<div class="xc"><div class="xr sp"><b>${E(o.name)}</b>${stChip(o.status)}</div><small>${xt("pdate")}: ${fdate(o.created_at)}</small><small>${xt("price")}: ${amt(o.total, o.currency)} · #${o.id}</small>${o.delivery ? `<small>${xt("cdata")}</small><div class="xcode">${E(o.delivery)}</div><button class="xbtn" data-x="copyo:${o.id}">${xt("copy")}</button>` : !["cancelled"].includes(o.status) ? `<small>${xt("waitdel")}</small>` : ""}</div>`).join("") : `<p class="empty">${xt("nopurch")}</p>`;
    HD.orders = r.orders;
  }
  async function drawOrdersPage() {
    subList(xt("myorders"), "acct", "xpg");
    const r = await call("orders", {}); const el = $("xpg"); if (!r.ok || !el) return;
    const f = r.orders.filter((o) => o.kind == "tool" || o.kind == "opt");
    el.innerHTML = f.length ? f.map(ordCard).join("") : `<p class="empty">${xt("noprodorders")}</p>`;
    HD.orders = r.orders;
  }
  async function drawAlertsPage() {
    subList(xt("alerts"), "acct", "xpg");
    const [r, a] = await Promise.all([call("notifications", {}), api("announcements", {})]); const el = $("xpg"); if (!r.ok || !el) return;
    el.innerHTML = `<div class="xr sp"><b>${xt("alerts")}</b><button class="xbtn" data-x="readall">${xt("readall")}</button></div>` +
      (r.items.length ? r.items.map((n) => `<div class="xc" data-x="notif:${n.id}" style="${n.is_read ? "opacity:.7" : "border-color:#E8A900"};cursor:pointer"><b>${E(L == "ar" ? n.title : n.title_en || n.title)}</b><div>${E(L == "ar" ? n.body : n.body_en || n.body)}</div><small>${fdate(n.created_at)}</small></div>`).join("") : `<p class="empty">${xt("nonotif")}</p>`) +
      (a.ok && a.items.length ? `<h2 style="margin-top:18px">${xt("anns")}</h2>` + a.items.map((n) => `<div class="xc">${n.image ? `<img src="${E(n.image)}" style="width:100%;border-radius:14px;margin-bottom:8px" alt="">` : ""}<b>${n.pinned ? "📌 " : ""}${E(n.title)}</b><div style="white-space:pre-wrap">${E(n.body)}</div><small>${fdate(n.created_at)}</small></div>`).join("") : "");
    call("notif_read", { all: 1 }); HD.unread = 0; drawBadges();
  }
  function drawPage() {
    const p = HD.page;
    if (p == "settings") drawSettings();
    else if (p == "lang" || p == "tone") drawPick(p);
    else if (p == "ai") drawAi();
    else if (p == "myfarms") drawFarmsPage();
    else if (p == "myorders") drawOrdersPage();
    else if (p == "alerts") drawAlertsPage();
  }
  async function checkUpdate() {
    toast(xt("checking"));
    await loadCfg();
    const u = (HD.cfg && HD.cfg.update) || {};
    const cmp = (a, b) => { const x = String(a || "0").split(".").map(Number), y = String(b || "0").split(".").map(Number); for (let i = 0; i < 4; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };
    if (u.version && cmp(u.version, APP_VER) > 0) {
      xsheet(`<h2>${xt("newver")} ${E(u.version)}</h2>${u.notes ? `<p class="xmut" style="white-space:pre-wrap">${E(u.notes)}</p>` : ""}${u.url ? `<a class="go" href="${E(u.url)}" target="_blank" rel="noopener" style="text-decoration:none"><span>${xt("updnow")}</span></a>` : ""}<button class="go" style="margin-top:10px;background:var(--field);color:var(--ink);box-shadow:none" data-x="closex"><span>${xt("cancel")}</span></button>`);
    } else toast(xt("latest"));
  }

  /* ---------- badges + polling ---------- */
  function drawBadges() {
    document.querySelectorAll(".xbd").forEach((e) => e.remove());
    const bell = document.querySelector('[data-h="b"]'); if (bell && HD.unread) bell.insertAdjacentHTML("beforeend", `<span class="xbd">${HD.unread > 99 ? "99+" : HD.unread}</span>`);
    const sb = document.querySelector('#nav [data-n="4"]'); if (sb && HD.sup) sb.insertAdjacentHTML("beforeend", `<span class="xbd">${HD.sup}</span>`);
  }
  async function pollNotifs() {
    if (!TOKEN || $("app").hidden) return;
    const r = await call("notif_poll", {});
    if (r.ok) {
      HD.unread = r.unread;
      if (r.last_id && r.last_id > HD.lastN) {
        if (HD.lastN && HD.notif) { toast(L == "ar" ? r.title : r.title_en || r.title); playTone(HD.tone); }
        HD.lastN = r.last_id; LSs("lastn", r.last_id);
      }
    }
    const q = await call("support_poll", {});
    if (q.ok) {
      HD.sup = (tab == 3 || tab == 4) && !HD.page ? 0 : q.unread;
      if (q.last_id && q.last_id > HD.lastS) {
        if (HD.lastS && HD.notif && !(tab == 3 || tab == 4)) { toast(xt("newreply") + ": " + q.body); playTone(HD.tone); }
        HD.lastS = q.last_id; LSs("lasts", q.last_id);
      }
    }
    drawBadges();
  }

  /* ---------- bottom bar: outline icons ---------- */
  const NI = [
    '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/><path d="M5 12v8h14v-8"/><path d="M9 20v-4h6v4"/>',
    '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 3.5V2h6v1.5"/><path d="M9 9h6M9 13h6M9 17h4"/>',
    '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="3" y="7.5" width="18" height="12" rx="2.5"/><path d="M16 13.5h5"/>',
    '<path d="M21 11.5a8 8 0 0 1-11.6 7.1L4 20l1.5-4.6A8 8 0 1 1 21 11.5z"/>',
    '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="2"/><rect x="17" y="14" width="4" height="6" rx="2"/><path d="M19 20c0 1.2-1.5 2-4 2"/>',
    '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
  ];
  const _nav = drawNav;
  drawNav = function () {
    _nav();
    document.querySelectorAll("#nav button").forEach((b, i) => { const sp = b.querySelector("span"); if (sp && NI[i]) sp.innerHTML = SV(NI[i]); });
  };

  /* ---------- hook into the existing app ---------- */
  const _draw = drawShop;
  drawShop = function () {
    _draw();
    drawBadges();
    aiFab();
    if (axe || opt) return;
    const v = $("view");
    if (tab == 0) { const t = v.querySelector(".tiles"); if (t) { t.id = "xch"; t.innerHTML = ""; } const h2 = v.querySelector(".sh h2"); if (h2) h2.innerHTML = `${IK.shop} ${S[L].items}`; drawGrid(); }
    else if (tab == 1) { v.innerHTML = `<div class="pad"><h2>${S[L].nav[1]}</h2><div id="xol"></div></div>`; paintOrders(); loadOrders(); }
    else if (tab == 2) drawWallet();
    else if (tab == 3 || tab == 4) drawChat();
    else if (tab == 5) {
      if (HD.page) return drawPage();
      const sel = $("lsel2");
      if (sel) {
        const card = sel.closest(".fc");
        if (card) card.outerHTML = settingsHTML();
      }
    }
  };
  const _enter = enter;
  enter = function () { _enter(); afterLogin(); };
  const _leave = leave;
  leave = function () { post({ type: "logout" }); HD.page = null; _leave(); };
  function afterLogin() {
    refreshMe(); loadCat(); loadHome(); loadOpt();
    if (HD.notif) post({ type: "login", token: TOKEN, tone: HD.tone });
    setTimeout(pollNotifs, 1500);
  }
  S.ar.bell = S.ar.bell || "التنبيهات";

  document.addEventListener("click", async (e) => {
    const bell = e.target.closest('[data-h="b"]');
    if (bell && TOKEN) { e.stopImmediatePropagation(); opt = false; axe = false; tab = 5; HD.page = "alerts"; drawShop(); scrollTo(0, 0); return; }
    const nv = e.target.closest("#nav [data-n]");
    if (nv) HD.page = null;
    const hp = e.target.closest('[data-h="p"]'); if (hp) HD.page = null;
    const b = e.target.closest("[data-x]");
    if (!b) return;
    const [a, i, d] = b.dataset.x.split(":");
    if (a == "cat") openXCat(+i);
    else if (a == "chip") { HD.chip = i; drawGrid(); }
    else if (a == "fav") { if (HD.favs.has(i)) HD.favs.delete(i); else HD.favs.add(i); LSs("favs", [...HD.favs]); drawGrid(); }
    else if (a == "q") { const p = HD.prods.find((x) => x.id == i); if (p) { const cap = p.qty < 0 ? (p.max_order > 0 ? p.max_order : 9999) : (p.max_order > 0 ? Math.min(p.qty, p.max_order) : p.qty); HD.qty[i] = Math.max(1, Math.min(cap, (HD.qty[i] || 1) + +d)); openXCat(HD.open); } }
    else if (a == "buy") buy(+i);
    else if (a == "top" || a == "gotop") { closeX(); HD.page = null; opt = false; axe = false; tab = 2; drawShop(); scrollTo(0, 0); }
    else if (a == "sel") { HD.sel = +i; paintMethods(); }
    else if (a == "copym") { e.stopPropagation(); const w = ((HD.cfg && HD.cfg.methods) || []).find((x) => x.id == i); if (w) copyText(w.info, b); }
    else if (a == "topup") submitTopup();
    else if (a == "send") sendMsg();
    else if (a == "retry") loadCfg();
    else if (a == "cc") { HD.cur = i; LSs("cur", i); drawConfirm(); setBal(ME && ME.balances); }
    else if (a == "wpick") { const m = ((HD.cfg && HD.cfg.methods) || []).find((x) => x.id == +i); if (m) { HD.cur = m.currency; HD.sel = m.id; LSs("cur", HD.cur); document.querySelectorAll(".wal.xw2").forEach((el) => { el.outerHTML = wallet(); }); setBal(ME && ME.balances); $("sheet").classList.remove("show"); } }
    else if (a == "curnext") { openCurSheet(); }
    else if (a == "curnext_old") { const cs = walCurs(); HD.cur = cs[(cs.indexOf(HD.cur) + 1) % cs.length]; LSs("cur", HD.cur); document.querySelectorAll(".wal.xw2").forEach((el) => { el.outerHTML = wallet(); }); setBal(ME && ME.balances); }
    else if (a == "dobuy") doBuy();
    else if (a == "closex") { HD.cf = null; closeX(); }
    else if (a == "copyv") copyText(HD.copyv, b);
    else if (a == "copyo") { const o = (HD.orders || []).find((x) => x.id == i); if (o) copyText(o.delivery, b); }
    else if (a == "farms") openFarms();
    else if (a == "codes") openCodes();
    else if (a == "boxes") openBoxes();
    else if (a == "groups") openGroups();
    else if (a == "farmbuy") { const f = HD.farms.find((x) => x.id == i); if (f) xconfirm({ title: f.name, lines: xt("farmnote"), usdt: f.price, run: (cur, key) => purchase("farm_buy", { id: f.id, currency: cur, idem_key: key }) }); }
    else if (a == "cq") { const c = HD.codes.find((x) => x.id == i); if (c) { HD.cq[i] = Math.max(1, Math.min(10, c.stock, (HD.cq[i] || 1) + +d)); openCodes(); } }
    else if (a == "codebuy") { const c = HD.codes.find((x) => x.id == i), n = Math.min(HD.cq[i] || 1, c.stock); if (c) xconfirm({ title: `${c.name} × ${n}`, usdt: c.price * n, run: (cur, key) => purchase("code_buy", { id: c.id, qty: n, currency: cur, idem_key: key }) }); }
    else if (a == "boxbuy") { const bx = HD.boxes.find((x) => x.id == i); if (bx) xconfirm({ title: bx.name, lines: Z("الجائزة تُحدَّد عشوائيًا من الخادم.", "The prize is picked randomly by the server.", "Phần thưởng được máy chủ chọn ngẫu nhiên.", "奖品由服务器随机抽取。"), usdt: bx.price, run: (cur, key) => purchase("random_buy", { id: bx.id, currency: cur, idem_key: key }, (o) => (o.lines && o.lines[0] && o.lines[0].prize) || "") }); }
    else if (a == "tx") openTx(b.dataset.x.slice(3));
    else if (a == "canceldep") { const r = await call("deposit_cancel", { order_id: +i }); if (r.ok) { closeX(); loadWalletData(); } else { const el = $("xerr"); if (el) el.innerHTML = `<div class="xerr">${E(emsg(r))}</div>`; } }
    // settings
    else if (a == "settings") { HD.page = "settings"; drawShop(); scrollTo(0, 0); }
    else if (a == "back") { HD.page = i == "acct" ? null : i; drawShop(); scrollTo(0, 0); }
    else if (a == "langsheet") { HD.page = "lang"; drawShop(); scrollTo(0, 0); }
    else if (a == "setl") { closeX(); setLang(i); if (HD.page == "lang") drawShop(); }
    else if (a == "tonesheet") { if (!HD.notif) return; HD.page = "tone"; drawShop(); scrollTo(0, 0); }
    else if (a == "settone") { HD.tone = i; LSs("tone", HD.tone); playTone(HD.tone); post({ type: "tone", token: TOKEN, tone: HD.tone }); drawShop(); }
    else if (a == "prev") playTone(i);
    else if (a == "notiftoggle") {
      HD.notif = !HD.notif; LSs("notif", HD.notif);
      const sw = $("nsw"); if (sw) sw.classList.toggle("on", HD.notif); const tr = $("trow"); if (tr) tr.style.opacity = HD.notif ? "" : ".45";
      if (HD.notif) { post({ type: "login", token: TOKEN, tone: HD.tone }); toast(xt("notifon")); }
      else { call("push_unregister", {}); toast(xt("notifoff")); }
    }
    else if (a == "gosup") { HD.page = null; tab = 4; drawShop(); scrollTo(0, 0); }
    else if (a == "alerts") { HD.page = "alerts"; drawShop(); }
    else if (a == "aiopen") aiOpen();
    else if (a == "aiback") aiBack();
    else if (a == "aisend") { const q = $("aiq"), v = q ? q.value.trim() : ""; if (v) { q.value = ""; aiSend(v, 0, ""); } }
    else if (a == "aiopt") { const lb = b.textContent.trim(); aiSend("", +i, lb); }
    else if (a == "aigo") { const g = HD.ai.go[+i] || ""; aiGo(g == "opt" ? '[data-p="1"]' : `[data-x="${g}"]`); }
    else if (a == "myfarms") { HD.page = "myfarms"; drawShop(); }
    else if (a == "myorders") { HD.page = "myorders"; drawShop(); }
    else if (a == "chkupd") checkUpdate();
    else if (a == "readall") { await call("notif_read", { all: 1 }); drawPage(); }
    else if (a == "notif") { call("notif_read", { id: +i }); const ref = ((HD.notifRefs || {})[i]) || ""; b.style.opacity = ".7"; }
    else if (a == "logoutask") xsheet(`<h2>${xt("logout")}</h2><p class="xmut">${xt("logoutq")}</p><button class="go" style="background:#c52b50" data-x="logoutyes"><span>${xt("logout")}</span></button><button class="go" style="margin-top:10px;background:var(--field);color:var(--ink);box-shadow:none" data-x="closex"><span>${xt("cancel")}</span></button>`);
    else if (a == "logoutyes") { closeX(); leave(); }
  }, true);
  document.addEventListener("change", (e) => {
    if (e.target.id == "xrc" && e.target.files[0]) resizeImg(e.target.files[0], (d) => {
      if (!d) return toast(emsg({}));
      HD.rc = d; const p = $("xrp"); p.src = d; p.hidden = false;
    });
    else if (e.target.id == "xtp" && e.target.files[0]) {
      const oid = +e.target.dataset.oid, tid = e.target.dataset.tid;
      resizeImg(e.target.files[0], async (d) => {
        if (!d) return toast(emsg({}));
        const r = await call("deposit_proof", { order_id: oid, proof: d });
        if (r.ok) { toast(xt("proofup")); openTx(tid); loadWalletData(); } else { const el = $("xerr"); if (el) el.innerHTML = `<div class="xerr">${E(emsg(r))}</div>`; }
      });
    }
    else if (e.target.name == "tn" && e.target.checked) {
      HD.tone = e.target.value; LSs("tone", HD.tone); playTone(HD.tone);
      post({ type: "tone", token: TOKEN, tone: HD.tone });
      const tr = $("trow"); if (tr) tr.innerHTML = row(IK.music, xt("tone"), toneName(HD.tone), "tonesheet");
    }
  });
  document.addEventListener("input", (e) => { if (e.target.id == "xamt") paintInfo(); });
  document.addEventListener("input", (e) => { if (HD.cf && e.target.id == "xtag") HD.cf.tag = e.target.value; else if (HD.cf && e.target.id == "xcap") HD.cf.cap = e.target.value; });
  document.addEventListener("keydown", (e) => { if (e.key == "Enter" && e.target.id == "xmsg") { e.preventDefault(); sendMsg(); } if (e.key == "Enter" && e.target.id == "aiq") { e.preventDefault(); const v = e.target.value.trim(); if (v) { e.target.value = ""; aiSend(v, 0, ""); } } });

  setInterval(() => {
    if (document.hidden) return;
    HD.tick++;
    if (HD.tick % 4 == 0) loadCfg();
    if (!TOKEN || $("app").hidden) return;
    if ((tab == 3 || tab == 4) && !axe && !opt && !HD.page) loadChat(false);
    if (tab == 5 && HD.page == "settings" && $("xlist")) loadChat(false);
    if (HD.tick % 3 == 0) pollNotifs();
    if (HD.tick % 4 == 0) {
      if (tab == 0 && !axe && !opt && !HD.page) { loadCat(); loadHome(); }
      else if (tab == 1) loadOrders();
      else if (tab == 2 && !HD.page) loadWalletData();
      if (opt) loadOpt();
    }
  }, 5000);

  loadCfg();
  loadCat();
  loadHome();
  loadOpt();
  if (TOKEN) post({ type: "login", token: TOKEN, tone: HD.tone });
})();
