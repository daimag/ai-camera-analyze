// app/api/toyo-occupancy/route.js
// 東洋商事（五日市店・河原町店）の入退店(occupancy_trends)を取得・集計する。
// APIキーは環境変数 VERKADA_API_KEY_TOYO から読む。
// PSJ版(app/api/occupancy/route.js)の2拠点対応版。site=五日市店|河原町店|all で絞り込み。

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const BASE = "https://api.verkada.com";

// 全カメラ（site付き）。preset は混雑傾向ラインID（2026-07-21 HAR取得）。
const ALL_CAMERAS = [
  { id: "540eb1f3-690a-44ed-a457-532152a59c0b", name: "正面入口",         site: "五日市店", preset: "b8cac027-c40f-41d7-b240-8c8effbe9e22" },
  { id: "f13d564e-4bbc-4f24-961b-d9ea116b21ac", name: "エレベーター前",   site: "五日市店", preset: "cbdd5268-2bf6-4196-b01b-9424e1f6d0ca" },
  { id: "0eb690a1-7fa6-4875-aced-387b43209ddd", name: "駐輪場",           site: "五日市店", preset: "5f9df3d4-2ac7-4f64-a6d8-40299c455f47" },
  { id: "da629d13-eee1-4fd2-add8-321b2453fa50", name: "正面玄関",         site: "河原町店", preset: "bcdf437a-3a1e-4d53-8ab5-46b770801b90" },
  { id: "01e00fb3-6d51-49ad-9955-7891a4121ceb", name: "エレベーターホール", site: "河原町店", preset: "bafc1163-2640-4163-a7ed-1c4cbac319a3" },
];
const SITE_SHORT = { "五日市店": "I", "河原町店": "K" };

// code は "I"|"K"|"all"（実店名は外部に出さない）
function pickCameras(code) {
  const all = code === "all" || !code;
  return ALL_CAMERAS
    .filter((c) => all || SITE_SHORT[c.site] === code)
    .map((c) => ({ ...c, code: SITE_SHORT[c.site], label: all ? `${SITE_SHORT[c.site]}·${c.name}` : c.name }));
}

const JST_OFFSET = 9 * 3600;

function jstTodayStr() {
  return new Date(Date.now() + JST_OFFSET * 1000).toISOString().slice(0, 10);
}
function dayStartEpoch(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 0, 0, 0) / 1000 - JST_OFFSET;
}
function dayRange(dateStr) {
  const start = dayStartEpoch(dateStr);
  return [start, start + 86400];
}
function dateStrFromEpoch(epoch) {
  return new Date((epoch + JST_OFFSET) * 1000).toISOString().slice(0, 10);
}
function dowOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function weekMondayEpoch(dateStr) {
  const start = dayStartEpoch(dateStr);
  const offset = (dowOf(dateStr) + 6) % 7;
  return start - offset * 86400;
}
async function getToken(key) {
  const r = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: { "x-api-key": key, accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`token取得失敗 HTTP ${r.status}`);
  return (await r.json()).token;
}
async function fetchCamera(headers, cam, start, end, interval) {
  const qs = new URLSearchParams({
    camera_id: cam.id, preset_id: cam.preset,
    start_time: String(start), end_time: String(end), interval,
  });
  const r = await fetch(`${BASE}/cameras/v1/analytics/occupancy_trends?${qs}`, { headers, cache: "no-store" });
  if (!r.ok) return { in: 0, out: 0, buckets: {} };
  const d = await r.json();
  const buckets = {};
  for (const x of d.trend_in || []) if (x.length >= 3) (buckets[x[0]] ??= [0, 0])[0] = x[2];
  for (const x of d.trend_out || []) if (x.length >= 3) (buckets[x[0]] ??= [0, 0])[1] = x[2];
  let ti = 0, to = 0;
  for (const k in buckets) { ti += buckets[k][0]; to += buckets[k][1]; }
  return { in: ti, out: to, buckets };
}

const CACHE = { headers: { "Cache-Control": "no-store, max-age=0" } };

async function getDay(headers, CAMERAS, date, gran) {
  const fine = gran === "15min";
  const [start, end] = dayRange(date);
  const interval = fine ? "15_minutes" : "1_hour";
  const hourly = Array.from({ length: 24 }, (_, h) => ({ h, in: 0, out: 0 }));
  const cameras = [];
  let totalIn = 0, totalOut = 0;

  const camHourIn = CAMERAS.map(() => Array(24).fill(0));
  const camQIn = fine ? CAMERAS.map(() => Array(96).fill(0)) : null;
  const qIO = fine ? Array.from({ length: 96 }, () => [0, 0]) : null;

  const results = await Promise.all(CAMERAS.map((c) => fetchCamera(headers, c, start, end, interval)));
  results.forEach((r, i) => {
    cameras.push({ name: CAMERAS[i].label, site: CAMERAS[i].code, in: r.in, out: r.out });
    totalIn += r.in; totalOut += r.out;
    for (const ts in r.buckets) {
      const sec = (Number(ts) + JST_OFFSET) % 86400;
      const h = Math.floor(sec / 3600);
      hourly[h].in += r.buckets[ts][0];
      hourly[h].out += r.buckets[ts][1];
      camHourIn[i][h] += r.buckets[ts][0];
      if (fine) { const q = Math.floor(sec / 900); qIO[q][0] += r.buckets[ts][0]; qIO[q][1] += r.buckets[ts][1]; camQIn[i][q] += r.buckets[ts][0]; }
    }
  });
  let run = 0, peak = 0, personHours = 0;
  for (const row of hourly) { run += row.in - row.out; row.stay = Math.max(0, run); peak = Math.max(peak, row.stay); personHours += row.stay; }

  // 並べ替え前にラベル→元インデックスの対応を保持
  const labelToIdx = {}; CAMERAS.forEach((c, i) => { labelToIdx[c.label] = i; });
  cameras.sort((a, b) => b.in - a.in);

  const current = Math.max(0, totalIn - totalOut);
  const dwellMin = totalIn ? Math.round((personHours / totalIn) * 60) : 0;
  let dashHour = -1, dashIn = 0;
  for (const row of hourly) { if (row.h <= 11 && row.in > dashIn) { dashIn = row.in; dashHour = row.h; } }

  const order = cameras.map((c) => c.name);
  for (const row of hourly) row.cams = order.map((nm) => camHourIn[labelToIdx[nm]][row.h]);

  // 店舗別 内訳（合算ビュー用）
  const bySite = {};
  cameras.forEach((c) => { (bySite[c.site] ??= { in: 0, out: 0 })[0]; bySite[c.site].in += c.in; bySite[c.site].out += c.out; });

  // ===== 分析サマリー =====
  const eveIn = hourly.filter((r) => r.h >= 17 && r.h <= 19).reduce((a, b) => a + b.in, 0);
  const evePct = totalIn ? Math.round(eveIn / totalIn * 100) : 0;
  const mPeak = hourly.filter((r) => r.h <= 12).reduce((a, b) => (b.in > a.in ? b : a), { in: 0, h: -1 });
  const ePeak = hourly.filter((r) => r.h >= 15).reduce((a, b) => (b.in > a.in ? b : a), { in: 0, h: -1 });
  const twoPeak = mPeak.in > 0 && ePeak.in >= mPeak.in * 0.4 && (ePeak.h - mPeak.h) >= 4;
  const topCam = (lo, hi) => {
    const sums = order.map(() => 0);
    for (const row of hourly) if (row.h >= lo && row.h <= hi) row.cams.forEach((v, i) => { sums[i] += v; });
    let mi = 0; sums.forEach((v, i) => { if (v > sums[mi]) mi = i; });
    return { name: order[mi] || "", in: sums[mi] || 0 };
  };
  const morningTop = topCam(0, 11), eveningTop = topCam(15, 23);
  let churnHour = -1, churnGap = 0;
  for (const row of hourly) { if (row.h >= 10 && row.h <= 18 && row.stay > 0) { const g = row.out - row.in; if (g > churnGap) { churnGap = g; churnHour = row.h; } } }
  const insights = {
    evePct, eveIn, twoPeak,
    mPeak: { h: mPeak.h, in: mPeak.in }, ePeak: { h: ePeak.h, in: ePeak.in },
    morningTop, eveningTop, churnHour, churnGap,
  };

  const resp = {
    mode: "day", date, gran: fine ? "15min" : "hour", updatedAt: new Date().toISOString(),
    totals: { in: totalIn, out: totalOut, peak, current, dwellMin, dashHour, dashIn },
    hourly, cameras, camNames: order, bySite, insights,
  };

  if (fine) {
    let qrun = 0; const quarters = [];
    for (let q = 0; q < 96; q++) {
      qrun += qIO[q][0] - qIO[q][1];
      const hh = Math.floor(q / 4), mm = (q % 4) * 15;
      quarters.push({ q, t: start + q * 900, label: `${hh}:${String(mm).padStart(2, "0")}`, h: hh, min: mm, in: qIO[q][0], out: qIO[q][1], stay: Math.max(0, qrun), cams: order.map((nm) => camQIn[labelToIdx[nm]][q]) });
    }
    let pk = null; for (const s of quarters) { if (!pk || s.in > pk.in) pk = s; }
    resp.quarters = quarters;
    resp.peak15 = pk && pk.in ? { label: pk.label, in: pk.in } : null;
  }
  return resp;
}

async function getSpan(headers, CAMERAS, mode, date) {
  let start, end, buildDays;
  if (mode === "week") {
    const monday = weekMondayEpoch(date);
    start = monday; end = monday + 7 * 86400;
    buildDays = () => Array.from({ length: 7 }, (_, i) => dateStrFromEpoch(monday + i * 86400));
  } else {
    const [y, m] = date.split("-").map(Number);
    start = Date.UTC(y, m - 1, 1) / 1000 - JST_OFFSET;
    end = Date.UTC(y, m, 1) / 1000 - JST_OFFSET;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    buildDays = () => Array.from({ length: dim }, (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
  }
  const daily = [], idxByDate = {};
  buildDays().forEach((ds) => { idxByDate[ds] = daily.length; daily.push({ date: ds, dow: dowOf(ds), in: 0, out: 0 }); });
  const results = await Promise.all(CAMERAS.map((c) => fetchCamera(headers, c, start, end, "1_day")));
  const camTot = CAMERAS.map((c) => ({ name: c.label, site: c.code, in: 0, out: 0 }));
  const camDayIn = {};
  let totalIn = 0, totalOut = 0;
  results.forEach((r, ci) => {
    for (const ts in r.buckets) {
      const ds = dateStrFromEpoch(Number(ts));
      const i = idxByDate[ds];
      if (i != null) {
        daily[i].in += r.buckets[ts][0]; daily[i].out += r.buckets[ts][1];
        (camDayIn[ds] ??= Array(CAMERAS.length).fill(0))[ci] = r.buckets[ts][0];
      }
    }
    camTot[ci].in += r.in; camTot[ci].out += r.out; totalIn += r.in; totalOut += r.out;
  });
  const cameras = camTot.sort((a, b) => b.in - a.in);
  const order = cameras.map((c) => c.name);
  const labelToIdx = {}; CAMERAS.forEach((c, i) => { labelToIdx[c.label] = i; });
  daily.forEach((day) => { day.cams = order.map((nm) => (camDayIn[day.date] || [])[labelToIdx[nm]] || 0); });
  const resp = {
    mode, date, updatedAt: new Date().toISOString(),
    totals: { in: totalIn, out: totalOut }, daily, cameras, camNames: order,
  };
  if (mode === "week") { resp.weekStart = daily[0].date; resp.weekEnd = daily[6].date; }
  else { resp.month = date.slice(0, 7); resp.monthStart = daily[0].date; resp.monthEnd = daily[daily.length - 1].date; }
  return resp;
}

export async function GET(request) {
  try {
    const key = process.env.VERKADA_API_KEY_TOYO;
    if (!key) return Response.json({ error: "VERKADA_API_KEY_TOYO が未設定です" }, { status: 500 });

    const sp = new URL(request.url).searchParams;
    const q = sp.get("date") || "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : jstTodayStr();
    const range = ["day", "week", "month"].includes(sp.get("range")) ? sp.get("range") : "day";
    const siteQ = sp.get("site");
    const site = ["I", "K"].includes(siteQ) ? siteQ : "all";
    const CAMERAS = pickCameras(site);

    const token = await getToken(key);
    const headers = { accept: "application/json", "x-verkada-auth": token };

    const payload = range === "day"
      ? await getDay(headers, CAMERAS, date, sp.get("gran"))
      : await getSpan(headers, CAMERAS, range, date);
    payload.site = site;
    return Response.json(payload, CACHE);
  } catch (e) {
    return Response.json({ error: String(e && e.message ? e.message : e) }, { status: 500 });
  }
}
