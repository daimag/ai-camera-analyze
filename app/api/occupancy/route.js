// app/api/occupancy/route.js
// Verkada Command 公開APIから、指定日の入退店(occupancy_trends)を取得して集計する。
// APIキーは環境変数 VERKADA_API_KEY（Vercel の Environment Variables）から読む。

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store"; // Next.jsのfetchキャッシュを全面無効化（常に最新）
export const revalidate = 0;

const BASE = "https://api.verkada.com";

// camera_id -> { name, preset_id }（混雑傾向ラインのID）
const CAMERAS = [
  { id: "ad01e978-38df-4c13-a201-2ca6db8bcfcf", name: "CM42-3 立体駐車場", preset: "c319341d-3545-494b-82d7-98fa095a34f2" },
  { id: "900cc576-3f4c-46c5-8a6a-9ba7e9ea22b5", name: "CM42-1 2号線北側", preset: "3c418723-07ca-487b-83d6-d6b68336f90a" },
  { id: "790ec38f-d1cc-4cae-8517-d35187709f5a", name: "CM42-2 2号線南側", preset: "777a96f7-7d67-4042-b305-29f6a49eb22f" },
  { id: "0376f10c-e188-4c50-bd03-643661d846f3", name: "CM42-4 市場側1", preset: "d7d88dee-16dd-459e-87c2-31a96e44bd9f" },
  { id: "9d4314e1-ea08-441e-8519-bd2ed4828861", name: "CM42-5 市場側2", preset: "43c170e6-c499-4bc0-af86-6a0f83a78219" },
];

const JST_OFFSET = 9 * 3600;

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

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
// 月曜始まりの週：指定日を含む週の月曜0:00(JST)のepochを返す
function weekMondayEpoch(dateStr) {
  const start = dayStartEpoch(dateStr);
  const offset = (dowOf(dateStr) + 6) % 7; // Mon=0
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
// 1カメラ分を取得。buckets = { bucketStartEpoch: [in, out] } と合計を返す
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

// 日単位（時間帯別）
async function getDay(headers, date) {
  const [start, end] = dayRange(date);
  const hourly = Array.from({ length: 24 }, (_, h) => ({ h, in: 0, out: 0 }));
  const cameras = [];
  let totalIn = 0, totalOut = 0;

  const results = await Promise.all(CAMERAS.map((c) => fetchCamera(headers, c, start, end, "1_hour")));
  results.forEach((r, i) => {
    cameras.push({ name: CAMERAS[i].name, in: r.in, out: r.out });
    totalIn += r.in; totalOut += r.out;
    for (const ts in r.buckets) {
      const h = Math.floor(((Number(ts) + JST_OFFSET) % 86400) / 3600);
      hourly[h].in += r.buckets[ts][0];
      hourly[h].out += r.buckets[ts][1];
    }
  });
  let run = 0, peak = 0, personHours = 0;
  for (const row of hourly) { run += row.in - row.out; row.stay = Math.max(0, run); peak = Math.max(peak, row.stay); personHours += row.stay; }
  cameras.sort((a, b) => b.in - a.in);

  // 追加指標
  const current = Math.max(0, totalIn - totalOut);              // 現在（今日）/終値 店内人数
  const dwellMin = totalIn ? Math.round((personHours / totalIn) * 60) : 0; // 平均滞在(推定・分)
  let dashHour = -1, dashIn = 0;                                 // 朝一ピーク（開店ダッシュ）
  for (const row of hourly) { if (row.h <= 11 && row.in > dashIn) { dashIn = row.in; dashHour = row.h; } }
  const carCam = cameras.find((c) => c.name.includes("立体駐車場")); // 車客＝駐車場入口
  const carIn = carCam ? carCam.in : 0;
  const walkIn = Math.max(0, totalIn - carIn);

  // カメラ別の時間帯内訳（入店）— 入店総数の多い順（cameras）に整列
  const order = cameras.map((c) => c.name);
  const nameToIdx = {}; CAMERAS.forEach((c, i) => { nameToIdx[c.name] = i; });
  const camHourIn = CAMERAS.map(() => Array(24).fill(0));
  results.forEach((r, i) => {
    for (const ts in r.buckets) {
      const h = Math.floor(((Number(ts) + JST_OFFSET) % 86400) / 3600);
      camHourIn[i][h] += r.buckets[ts][0];
    }
  });
  for (const row of hourly) row.cams = order.map((nm) => camHourIn[nameToIdx[nm]][row.h]);

  return {
    mode: "day", date, updatedAt: new Date().toISOString(),
    totals: { in: totalIn, out: totalOut, peak, current, dwellMin, dashHour, dashIn, carIn, walkIn },
    hourly, cameras, camNames: order,
  };
}

// 週単位（曜日別・月曜始まり）— 月と同じ 1_day 方式で統一（Verkadaウィジェットと一致）
async function getWeek(headers, date) {
  const monday = weekMondayEpoch(date);
  const end = monday + 7 * 86400;
  const daily = [], idxByDate = {};
  for (let i = 0; i < 7; i++) {
    const ds = dateStrFromEpoch(monday + i * 86400);
    idxByDate[ds] = i;
    daily.push({ date: ds, dow: dowOf(ds), in: 0, out: 0 });
  }
  const results = await Promise.all(CAMERAS.map((c) => fetchCamera(headers, c, monday, end, "1_day")));
  const camTot = CAMERAS.map((c) => ({ name: c.name, in: 0, out: 0 }));
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
  const nameToIdx = {}; CAMERAS.forEach((c, i) => { nameToIdx[c.name] = i; });
  daily.forEach((day) => { day.cams = order.map((nm) => (camDayIn[day.date] || [])[nameToIdx[nm]] || 0); });
  return {
    mode: "week", date,
    weekStart: daily[0].date, weekEnd: daily[6].date,
    updatedAt: new Date().toISOString(),
    totals: { in: totalIn, out: totalOut },
    daily, cameras, camNames: order,
  };
}

// 月単位（日別・1_dayバケット＝軽量）
async function getMonth(headers, date) {
  const [y, m] = date.split("-").map(Number);
  const first = Date.UTC(y, m - 1, 1) / 1000 - JST_OFFSET;
  const next = Date.UTC(y, m, 1) / 1000 - JST_OFFSET;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daily = [], idxByDate = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    idxByDate[ds] = daily.length;
    daily.push({ date: ds, dow: dowOf(ds), in: 0, out: 0 });
  }
  const results = await Promise.all(CAMERAS.map((c) => fetchCamera(headers, c, first, next, "1_day")));
  const camTot = CAMERAS.map((c) => ({ name: c.name, in: 0, out: 0 }));
  const camDayIn = {}; // date -> [各カメラの入店]（CAMERAS順）
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
  const nameToIdx = {}; CAMERAS.forEach((c, i) => { nameToIdx[c.name] = i; });
  daily.forEach((day) => { day.cams = order.map((nm) => (camDayIn[day.date] || [])[nameToIdx[nm]] || 0); });
  return {
    mode: "month", date, month: `${y}-${String(m).padStart(2, "0")}`,
    monthStart: daily[0].date, monthEnd: daily[daily.length - 1].date,
    updatedAt: new Date().toISOString(),
    totals: { in: totalIn, out: totalOut },
    daily, cameras, camNames: order,
  };
}

export async function GET(request) {
  try {
    const key = process.env.VERKADA_API_KEY;
    if (!key) return Response.json({ error: "VERKADA_API_KEY が未設定です" }, { status: 500 });

    const sp = new URL(request.url).searchParams;
    const q = sp.get("date") || "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : jstTodayStr();
    const range = ["day", "week", "month"].includes(sp.get("range")) ? sp.get("range") : "day";

    const token = await getToken(key);
    const headers = { accept: "application/json", "x-verkada-auth": token };

    const payload = range === "month" ? await getMonth(headers, date)
      : range === "week" ? await getWeek(headers, date)
      : await getDay(headers, date);
    return Response.json(payload, CACHE);
  } catch (e) {
    return Response.json({ error: String(e && e.message ? e.message : e) }, { status: 500 });
  }
}
