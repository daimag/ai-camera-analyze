// app/api/weather/route.js
// 下関市（PSJ新下関店付近）の天気を Open-Meteo から取得（APIキー不要）。

export const dynamic = "force-dynamic";

const LAT = 34.0083;   // 下関市一の宮付近
const LON = 130.9414;

const WMO = {
  0: ["快晴", "☀️"], 1: ["晴れ", "🌤️"], 2: ["薄曇り", "⛅"], 3: ["曇り", "☁️"],
  45: ["霧", "🌫️"], 48: ["霧氷", "🌫️"],
  51: ["弱い霧雨", "🌦️"], 53: ["霧雨", "🌦️"], 55: ["強い霧雨", "🌧️"],
  61: ["弱い雨", "🌦️"], 63: ["雨", "🌧️"], 65: ["強い雨", "🌧️"],
  66: ["着氷性の雨", "🌧️"], 67: ["強い着氷性の雨", "🌧️"],
  71: ["弱い雪", "🌨️"], 73: ["雪", "🌨️"], 75: ["強い雪", "❄️"], 77: ["霧雪", "🌨️"],
  80: ["にわか雨", "🌦️"], 81: ["にわか雨", "🌧️"], 82: ["激しいにわか雨", "⛈️"],
  85: ["にわか雪", "🌨️"], 86: ["強いにわか雪", "❄️"],
  95: ["雷雨", "⛈️"], 96: ["雹を伴う雷雨", "⛈️"], 99: ["激しい雷雨", "⛈️"],
};

function jstTodayStr() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function GET(request) {
  try {
    const q = new URL(request.url).searchParams.get("date") || "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : jstTodayStr();
    const isToday = date === jstTodayStr();

    const qs = new URLSearchParams({
      latitude: String(LAT), longitude: String(LON),
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
      timezone: "Asia/Tokyo", start_date: date, end_date: date,
    });
    if (isToday) qs.set("current", "temperature_2m,weather_code");

    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`);
    if (!r.ok) throw new Error(`weather取得失敗 HTTP ${r.status}`);
    const d = await r.json();

    const code = d.daily?.weather_code?.[0];
    const [desc, emoji] = WMO[code] || ["--", "🌡️"];
    const out = {
      date,
      tmax: d.daily?.temperature_2m_max?.[0] ?? null,
      tmin: d.daily?.temperature_2m_min?.[0] ?? null,
      precip: d.daily?.precipitation_sum?.[0] ?? null,
      code, desc, emoji,
    };
    if (isToday && d.current) {
      const [cdesc, cemoji] = WMO[d.current.weather_code] || [desc, emoji];
      out.current = { temp: d.current.temperature_2m, desc: cdesc, emoji: cemoji };
    }
    return Response.json(out, { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=1800" } });
  } catch (e) {
    return Response.json({ error: String(e && e.message ? e.message : e) }, { status: 500 });
  }
}
