"use client";
import { useEffect } from "react";

const MARKUP = `
<div class="wrap">
  <header class="masthead">
    <div>
      <p class="eyebrow">店舗 入退店アナリティクス</p>
      <h1>入退店ダッシュボード<small>AIカメラ ＋ 公開API による来店計測</small></h1>
    </div>
  </header>

  <section class="strip">
    <div class="chip picker">
      <span class="k">表示日</span>
      <input type="date" id="datePick">
    </div>
    <div class="chip date">
      <span class="k">日付</span>
      <span class="v"><span id="dateJp">--</span><span class="dow" id="dow">-</span></span>
    </div>
    <div class="chip clock">
      <span class="k">現在時刻（JST）</span>
      <span class="v num" id="clock">--:--:--</span>
    </div>
    <div class="chip">
      <span class="k">API最新取得</span>
      <span class="v num" id="apiTime" style="font-size:15px">--:--:--</span>
    </div>
    <div class="chip wx">
      <span class="k" id="wxLabel">現地の天気</span>
      <span class="v"><span class="emo" id="wxEmo">🌡️</span><span id="wxTemp">--</span><span class="mm" id="wxMM"></span></span>
    </div>
    <div class="chip seg-chip">
      <span class="k">表示単位</span>
      <div class="seg" id="modeSeg">
        <button type="button" data-mode="day" class="on">日（時間帯）</button>
        <button type="button" data-mode="week">週（曜日別）</button>
      </div>
    </div>
    <div class="spacer"></div>
    <button type="button" id="refreshBtn" class="refresh">↻ 更新</button>
    <div class="live"><span class="d"></span><span id="liveTxt">読み込み中…</span></div>
  </section>

  <section class="kpis" id="kpis">
    <div class="kpi skel"><div class="lab"><span class="dot" style="background:var(--in)"></span>総入店</div><div class="val num">–</div></div>
    <div class="kpi skel"><div class="lab"><span class="dot" style="background:var(--out)"></span>総退店</div><div class="val num">–</div></div>
    <div class="kpi skel"><div class="lab"><span class="dot" style="background:var(--stay)"></span>店内滞在ピーク</div><div class="val num">–</div></div>
    <div class="kpi skel"><div class="lab"><span class="dot" style="background:var(--accent)"></span>主入口</div><div class="val">–</div></div>
  </section>

  <section class="card">
    <div class="h"><h2 id="chartTitle">時間帯別 入退店 ＆ 店内滞在</h2><span class="hint" id="chartHint">1時間単位・JST</span></div>
    <div class="legend" id="legend"></div>
    <div id="chartHost" class="chart-scroll"><svg id="hchart" viewBox="0 0 960 380" role="img" aria-label="グラフ"></svg></div>
  </section>

  <section class="card">
    <div class="h"><h2>入口（カメラ）別 入店数</h2><span class="hint">People Counting Line 横断数</span></div>
    <div class="ent" id="entrances"></div>
  </section>

  <section class="api">
    <p class="cap">技術仕様</p>
    <h2>使用しているAPIと仕組み</h2>
    <p class="lead">来店データは <b>Verkada Command 公開REST API</b>、天気は <b>Open-Meteo</b> から取得しています。いずれもサーバー側（Vercel関数）から直接呼び出し、ブラウザ操作や画面キャプチャは行いません。</p>
    <div class="grid2">
      <div class="panel">
        <h3><span class="k">GET</span> 入退店データ（Verkada）</h3>
<pre><span class="c"># 1) トークン発行（APIキー → 認証トークン）</span>
<span class="m">POST</span> <span class="u">https://api.verkada.com/token</span>
     <span class="c">header:</span> x-api-key: &lt;APIキー / 環境変数&gt;

<span class="c"># 2) 入退店トレンド取得</span>
<span class="m">GET</span> <span class="u">https://api.verkada.com</span>
     /cameras/v1/analytics/<span class="s">occupancy_trends</span>
     ?camera_id=&lt;カメラID&gt;
     &amp;preset_id=&lt;混雑傾向ラインID&gt;
     &amp;start_time=…&amp;end_time=…&amp;interval=1_hour
     <span class="c">header:</span> x-verkada-auth: &lt;トークン&gt;</pre>
      </div>
      <div class="panel">
        <h3>主なパラメータ / レスポンス</h3>
        <table class="params">
          <tr><th>項目</th><th>内容</th></tr>
          <tr><td><code>camera_id</code></td><td class="d">対象カメラ（入口ごと・全5台）</td></tr>
          <tr><td><code>preset_id</code></td><td class="d">Commandで設定した混雑傾向ラインのID</td></tr>
          <tr><td><code>interval</code></td><td class="d">集計粒度（1_hour / 15_minutes / 1_day）</td></tr>
          <tr><td><code>trend_in / trend_out</code></td><td class="d">入店/退店：<code>[開始秒,終了秒,人数]</code> の配列</td></tr>
          <tr><td><code>天気</code></td><td class="d">Open-Meteo（緯度経度指定・キー不要）</td></tr>
        </table>
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <h3>データフロー（全自動・サーバーレス）</h3>
      <div class="flow">
        <div class="step"><div class="n">01</div><div class="t">AIカメラ</div><div class="x">各入口でラインを横断した人物を入/出で計測</div></div>
        <div class="arrow">→</div>
        <div class="step"><div class="n">02</div><div class="t">Verkada クラウド</div><div class="x">計測値を集計・保持</div></div>
        <div class="arrow">→</div>
        <div class="step"><div class="n">03</div><div class="t">Vercel関数</div><div class="x">公開APIと天気を取得・集計</div></div>
        <div class="arrow">→</div>
        <div class="step"><div class="n">04</div><div class="t">本ダッシュボード</div><div class="x">ブラウザで即時可視化</div></div>
      </div>
    </div>
    <div class="note">
      <b>ご確認事項（計測仕様）</b>
      <ul>
        <li>入退店は Verkada Command で各カメラに設定した「混雑傾向ライン」に基づく実測カウントです（2026-07-08 設定）。</li>
        <li><b>ラインは遡及計測不可</b>：設定日より前は取得できず、設定以降を蓄積します。</li>
        <li>当日分は営業中の速報値で、時間とともに更新されます。</li>
      </ul>
    </div>
  </section>

  <section class="api">
    <p class="cap">拡張提案 / ROADMAP</p>
    <h2>今後の分析拡張プラン（ご提案）</h2>
    <p class="lead">現在のダッシュボード（入退店・滞在・朝一・来店手段）に加え、パチンコ店の運営判断に直結する指標を段階的に追加できます。タグは実現条件の目安です。</p>
    <div class="props">
      <div class="prop"><div class="no">01</div><div class="b"><p class="t">稼働率（占有率）</p>
        <p class="x">現在滞在 ÷ 総台数。パチンコ運営で最重要の「稼働」を時間帯別カーブで可視化。</p><span class="tag cap">総台数の登録で可</span></div></div>
      <div class="prop"><div class="no">02</div><div class="b"><p class="t">年金・給料日 効果</p>
        <p class="x">偶数月15日（年金）・5/25日（給料日）と来店増の相関を、通常日と比較して数値化。</p><span class="tag acc">データ蓄積で可</span></div></div>
      <div class="prop"><div class="no">03</div><div class="b"><p class="t">夕方ラッシュ指数</p>
        <p class="x">17〜19時の入店比率。朝一比率とセットで「朝型の店／夜型の店」を判定。</p><span class="tag now">即実装可</span></div></div>
      <div class="prop"><div class="no">04</div><div class="b"><p class="t">二部制の山（二峰性）</p>
        <p class="x">入店カーブが朝一集中か、夕方にもう一山あるかを判定し、専業／兼業の客層を推定。</p><span class="tag now">即実装可</span></div></div>
      <div class="prop"><div class="no">05</div><div class="b"><p class="t">入口別の時間帯クセ</p>
        <p class="x">駐車場＝朝一集中（車・地元常連）、街道側＝夕方寄り（近隣・徒歩）など客層差を可視化。</p><span class="tag now">即実装可</span></div></div>
      <div class="prop"><div class="no">06</div><div class="b"><p class="t">回転の質・機会損失</p>
        <p class="x">短時間で退店する客が多い時間帯＝空き台なし／見切りのシグナルを検出。</p><span class="tag now">即実装可</span></div></div>
      <div class="prop"><div class="no">07</div><div class="b"><p class="t">天気 × 来店 相関</p>
        <p class="x">雨・猛暑ほど来店増、を回帰で検証。天気は取得済みのため蓄積するだけで分析可能。</p><span class="tag acc">データ蓄積で可</span></div></div>
      <div class="prop"><div class="no">08</div><div class="b"><p class="t">曜日×時間ヒートマップ／混雑予報</p>
        <p class="x">混雑を色で可視化。蓄積後は「今から行くと混雑」の予報も提供可能。</p><span class="tag acc">データ蓄積で可</span></div></div>
      <div class="prop"><div class="no">09</div><div class="b"><p class="t">ナンバー認識（LPR）商圏分析</p>
        <p class="x">リピート車両率（常連度）・遠方ナンバー割合（商圏の広さ）・来店頻度を分析。</p><span class="tag ext">カメラ拡張(LPR)で可</span></div></div>
      <div class="prop"><div class="no">10</div><div class="b"><p class="t">開店前の期待度</p>
        <p class="x">開店前の駐車場・入口の滞留量＝「今日は出ると読まれている日」の先行指標。</p><span class="tag ext">検知拡張で可</span></div></div>
    </div>
    <div class="note">
      <b>実装ステップのご提案</b>
      <ul>
        <li><b>Step1（即日）</b>：③夕方ラッシュ・④二峰性・⑤入口別クセ・⑥機会損失 ― 現在のデータで追加可能。</li>
        <li><b>Step2（要ヒアリング）</b>：①稼働率 ― 総台数のご登録で、稼働カーブまで表示。</li>
        <li><b>Step3（数週間の蓄積）</b>：②年金/給料日・⑦天気相関・⑧ヒートマップ／混雑予報。</li>
        <li><b>Step4（カメラ拡張）</b>：⑨LPR商圏分析・⑩開店前期待度。</li>
      </ul>
    </div>
  </section>

  <footer>
    <span>データ源：AIカメラ公開API ／ 天気：Open-Meteo</span>
    <span>Next.js on Vercel・ライブ生成</span>
  </footer>
</div>
`;

function boot() {
  const DOW = ["日", "月", "火", "水", "木", "金", "土"];
  const css = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  const $ = (id) => document.getElementById(id);
  let current = null;
  let mode = "day";
  const timers = [];
  const jstNow = () => new Date(Date.now() + 9 * 3600 * 1000);
  const jstTodayStr = () => jstNow().toISOString().slice(0, 10);

  function tickClock() {
    const d = jstNow(), p = (n) => String(n).padStart(2, "0");
    const el = $("clock");
    if (el) el.textContent = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  }
  tickClock(); timers.push(setInterval(tickClock, 1000));

  function setDateLabel(dateStr) {
    const [y, m, dd] = dateStr.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    $("dateJp").textContent = `${y}年${m}月${dd}日`;
    const el = $("dow");
    el.textContent = DOW[dow];
    el.className = "dow" + (dow === 0 ? " sun" : dow === 6 ? " sat" : "");
  }

  async function loadWeather(dateStr) {
    try {
      const w = await (await fetch(`/api/weather?date=${dateStr}`)).json();
      if (w.error) throw new Error(w.error);
      $("wxEmo").textContent = (w.current && w.current.emoji) || w.emoji || "🌡️";
      const temp = w.current ? `${Math.round(w.current.temp)}°C` : (w.tmax != null ? `${Math.round(w.tmax)}°C` : "--");
      $("wxTemp").textContent = temp;
      const desc = (w.current && w.current.desc) || w.desc || "";
      $("wxMM").textContent = (w.tmax != null && w.tmin != null) ? `${desc}・${Math.round(w.tmax)}/${Math.round(w.tmin)}°` : desc;
      $("wxLabel").textContent = w.current ? "現地の天気（現在）" : "現地の天気";
    } catch (e) { $("wxTemp").textContent = "取得不可"; }
  }

  const DOTS = { in: "var(--in)", out: "var(--out)", stay: "var(--stay)", accent: "var(--accent)" };
  const fmtDwell = (min) => {
    if (!min) return "–";
    if (min >= 60) return `${Math.floor(min / 60)}<span class="u">時間</span>${min % 60}<span class="u">分</span>`;
    return `${min}<span class="u">分</span>`;
  };
  const kpi = (dot, lab, val, sub, big) =>
    `<div class="kpi"><div class="lab"><span class="dot" style="background:${dot}"></span>${lab}</div>
      <div class="val${big ? "" : " num"}"${big ? ' style="font-size:20px"' : ""}>${val}</div><div class="sub">${sub}</div></div>`;

  function renderKpis(d) {
    let html;
    if (d.mode === "week") {
      // 営業日＝ピーク日の20%以上の入店がある日（設定日・休業日の少数ノイズを除外）
      const maxIn = Math.max(0, ...d.daily.map((x) => x.in));
      const bizDays = d.daily.filter((x) => x.in >= Math.max(1, maxIn * 0.2));
      const bizIn = bizDays.reduce((a, b) => a + b.in, 0);
      const avg = bizDays.length ? Math.round(bizIn / bizDays.length) : 0;
      const busiest = d.daily.reduce((a, b) => (b.in > a.in ? b : a), d.daily[0]);
      const bLab = busiest.in ? `${DOW[busiest.dow]}曜（${Number(busiest.date.slice(8))}日）` : "–";
      html =
        kpi(DOTS.in, "週合計 入店", `${d.totals.in.toLocaleString()}<span class="u">人</span>`, "月〜日の入店合計") +
        kpi(DOTS.out, "週合計 退店", `${d.totals.out.toLocaleString()}<span class="u">人</span>`, "月〜日の退店合計") +
        kpi(DOTS.stay, "1営業日あたり", `${avg.toLocaleString()}<span class="u">人</span>`, `営業${bizDays.length}日の平均入店`) +
        kpi(DOTS.accent, "最多来店日", bLab, busiest.in ? `<span class="num">${busiest.in.toLocaleString()}人</span>` : "", true);
    } else {
      const t = d.totals, tot = t.in || 0;
      const isT = d.date === jstTodayStr();
      const dashPct = (t.dashHour >= 0 && tot) ? Math.round(t.dashIn / tot * 100) : 0;
      const carPct = tot ? Math.round((t.carIn || 0) / tot * 100) : 0;
      const io = `<div class="kpi"><div class="lab"><span class="dot" style="background:var(--in)"></span>総入店 <span style="color:var(--faint)">/</span> <span class="dot" style="background:var(--out)"></span>総退店</div>
        <div class="val num" style="font-size:24px"><span style="color:var(--in)">${t.in.toLocaleString()}</span> <span style="color:var(--faint)">/</span> <span style="color:var(--out)">${t.out.toLocaleString()}</span><span class="u">人</span></div>
        <div class="sub">入店 / 退店（ライン横断数）</div></div>`;
      html =
        io +
        kpi(DOTS.stay, isT ? "店内滞在（現在）" : "店内滞在（終値）", `${(t.current || 0).toLocaleString()}<span class="u">人</span>`, isT ? "いま店内にいる推定人数" : "終業時点の推定人数") +
        kpi(DOTS.stay, "滞在ピーク", `${(t.peak || 0).toLocaleString()}<span class="u">人</span>`, "当日の最大滞在") +
        kpi(DOTS.accent, "平均滞在時間", fmtDwell(t.dwellMin || 0), "推定・入店〜退店（リトルの法則）") +
        kpi(DOTS.in, "朝一比率", `${dashPct}<span class="u">%</span>`, t.dashHour >= 0 ? `${t.dashHour}時に${t.dashIn.toLocaleString()}人（開店ダッシュ）` : "—") +
        kpi(DOTS.accent, "車客比率", `${carPct}<span class="u">%</span>`, `立体駐車場 ${(t.carIn || 0).toLocaleString()}人（車利用の目安）`);
    }
    $("kpis").innerHTML = html;
  }

  function renderHead(d) {
    if (d.mode === "week") {
      $("chartTitle").textContent = "曜日別 入退店（週）";
      $("chartHint").textContent = `${d.weekStart} 〜 ${d.weekEnd}`;
      $("legend").innerHTML = '<span><i style="background:var(--in)"></i>入店</span><span><i style="background:var(--out)"></i>退店</span>';
    } else {
      $("chartTitle").textContent = "時間帯別 入退店 ＆ 店内滞在";
      $("chartHint").textContent = "1時間単位・JST";
      $("legend").innerHTML = '<span><i style="background:var(--in)"></i>入店</span><span><i style="background:var(--out)"></i>退店</span><span><i class="ln"></i>店内滞在（推定・右軸）</span>';
    }
  }

  function renderEntrances(d) {
    const cs = d.cameras, mx = Math.max(1, ...cs.map((c) => c.in)), tot = Math.max(1, d.totals.in);
    let head = "";
    if (d.mode === "day" && d.totals.carIn != null && d.totals.in > 0) {
      const car = d.totals.carIn, walk = d.totals.walkIn;
      const cp = Math.round(car / tot * 100), wp = 100 - cp;
      head = `<div class="means"><div class="means-bar"><span class="car" style="width:${cp}%"></span><span class="walk" style="width:${wp}%"></span></div>
        <div class="means-lab"><span>🚗 車（立体駐車場） <b>${cp}%</b>・${car.toLocaleString()}人</span><span>🚶 徒歩・その他入口 <b>${wp}%</b>・${walk.toLocaleString()}人</span></div></div>`;
    }
    $("entrances").innerHTML = head + cs.map((e, i) => `
      <div class="row"><div class="nm">${e.name}${i === 0 && e.in > 0 ? "<b>主入口</b>" : ""}</div>
        <div class="bar"><i style="width:${(e.in / mx * 100).toFixed(1)}%"></i></div>
        <div class="v num">${e.in.toLocaleString()}<span class="p">${(e.in / tot * 100).toFixed(0)}%</span></div></div>`).join("");
  }

  function renderChart(d) {
    const rows = d.hourly.filter((r) => r.in || r.out);
    const host = $("chartHost");
    if (!rows.length) {
      host.innerHTML = '<div class="state">この日の入退店データはまだありません（休業日、または営業前）。</div>';
      return;
    }
    host.innerHTML = '<svg id="hchart" viewBox="0 0 960 380" role="img" aria-label="時間帯別グラフ"></svg>';
    const minH = Math.max(0, rows[0].h - 1), maxH = Math.min(23, rows[rows.length - 1].h + 1);
    const view = d.hourly.filter((r) => r.h >= minH && r.h <= maxH);
    const W = 960, H = 380, m = { t: 24, r: 56, b: 44, l: 52 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const maxBar = Math.max(1, ...view.map((r) => Math.max(r.in, r.out)));
    const maxStay = Math.max(1, ...view.map((r) => r.stay));
    const yBar = (v) => m.t + ih - (v / maxBar) * ih, yStay = (v) => m.t + ih - (v / maxStay) * ih;
    const n = view.length, slot = iw / n, gap = slot * 0.16, bw = (slot - gap * 2) / 2;
    const cIn = css("--in"), cOut = css("--out"), cStay = css("--stay");
    const curHour = d.date === jstTodayStr() ? jstNow().getUTCHours() : -1; // 進行中の時間
    let s = ""; const ticks = 4;
    for (let t = 0; t <= ticks; t++) { const val = Math.round(maxBar * t / ticks), y = yBar(val);
      s += `<line class="grid" x1="${m.l}" y1="${y.toFixed(1)}" x2="${m.l + iw}" y2="${y.toFixed(1)}"/>`;
      s += `<text class="axis" x="${m.l - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${val}</text>`; }
    for (let t = 0; t <= ticks; t++) { const val = Math.round(maxStay * t / ticks), y = yStay(val);
      s += `<text class="axis" x="${m.l + iw + 8}" y="${(y + 4).toFixed(1)}" text-anchor="start" style="fill:${cStay}">${val}</text>`; }
    s += `<line class="baseline" x1="${m.l}" y1="${m.t + ih}" x2="${m.l + iw}" y2="${m.t + ih}"/>`;
    view.forEach((r, idx) => {
      const x0 = m.l + slot * idx + gap, cur = r.h === curHour;
      const op = cur ? ' opacity="0.42"' : "";
      s += `<rect x="${x0.toFixed(1)}" y="${yBar(r.in).toFixed(1)}" width="${bw.toFixed(1)}" height="${(m.t + ih - yBar(r.in)).toFixed(1)}" rx="2.5" fill="${cIn}"${op}/>`;
      s += `<rect x="${(x0 + bw).toFixed(1)}" y="${yBar(r.out).toFixed(1)}" width="${bw.toFixed(1)}" height="${(m.t + ih - yBar(r.out)).toFixed(1)}" rx="2.5" fill="${cOut}"${op}/>`;
      const lblStyle = cur ? ' style="fill:var(--accent);font-weight:700"' : "";
      s += `<text class="axis-t" x="${(x0 + bw).toFixed(1)}" y="${H - m.b + 18}" text-anchor="middle"${lblStyle}>${r.h}時</text>`;
      if (cur) {
        const ytop = Math.min(yBar(r.in), yBar(r.out)) - 6;
        s += `<text x="${(x0 + bw).toFixed(1)}" y="${ytop.toFixed(1)}" text-anchor="middle" style="fill:var(--accent);font-size:10px;font-weight:700">速報</text>`;
      }
    });
    const pts = view.map((r, idx) => [m.l + slot * idx + slot / 2, yStay(r.stay)]);
    s += `<polyline fill="none" stroke="${cStay}" stroke-width="2.6" stroke-linejoin="round" points="${pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"/>`;
    pts.forEach((p, idx) => { const last = idx === pts.length - 1;
      s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${last ? 4.5 : 3}" fill="${cStay}" stroke="var(--panel)" stroke-width="1.5"/>`;
      if (last) s += `<text x="${p[0].toFixed(1)}" y="${(p[1] - 12).toFixed(1)}" text-anchor="middle" style="fill:${cStay};font-size:12px;font-weight:700">${view[idx].stay}</text>`; });
    $("hchart").innerHTML = s;
  }

  function renderWeekChart(d) {
    const host = $("chartHost");
    const view = d.daily;
    if (!view.some((r) => r.in || r.out)) {
      host.innerHTML = '<div class="state">この週の入退店データはまだありません。</div>';
      return;
    }
    host.innerHTML = '<svg id="hchart" viewBox="0 0 960 380" role="img" aria-label="曜日別グラフ"></svg>';
    const W = 960, H = 388, m = { t: 28, r: 20, b: 74, l: 52 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const maxBar = Math.max(1, ...view.map((r) => Math.max(r.in, r.out)));
    const yBar = (v) => m.t + ih - (v / maxBar) * ih;
    const n = view.length, slot = iw / n, gap = slot * 0.18, bw = (slot - gap * 2) / 2;
    const cIn = css("--in"), cOut = css("--out");
    const busiest = view.reduce((a, b) => (b.in > a.in ? b : a), view[0]);
    let s = ""; const ticks = 4;
    for (let t = 0; t <= ticks; t++) { const val = Math.round(maxBar * t / ticks), y = yBar(val);
      s += `<line class="grid" x1="${m.l}" y1="${y.toFixed(1)}" x2="${m.l + iw}" y2="${y.toFixed(1)}"/>`;
      s += `<text class="axis" x="${m.l - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${val}</text>`; }
    s += `<line class="baseline" x1="${m.l}" y1="${m.t + ih}" x2="${m.l + iw}" y2="${m.t + ih}"/>`;
    view.forEach((r, idx) => {
      const x0 = m.l + slot * idx + gap;
      s += `<rect x="${x0.toFixed(1)}" y="${yBar(r.in).toFixed(1)}" width="${bw.toFixed(1)}" height="${(m.t + ih - yBar(r.in)).toFixed(1)}" rx="3" fill="${cIn}"/>`;
      s += `<rect x="${(x0 + bw).toFixed(1)}" y="${yBar(r.out).toFixed(1)}" width="${bw.toFixed(1)}" height="${(m.t + ih - yBar(r.out)).toFixed(1)}" rx="3" fill="${cOut}"/>`;
      if (r.in) s += `<text x="${(x0 + bw).toFixed(1)}" y="${(yBar(r.in) - 6).toFixed(1)}" text-anchor="middle" style="fill:var(--ink);font-size:11.5px;font-weight:${r === busiest ? 800 : 600}">${r.in.toLocaleString()}</text>`;
      const lab = ["日", "月", "火", "水", "木", "金", "土"][r.dow];
      const cx = (x0 + bw).toFixed(1);
      s += `<text class="axis-t" x="${cx}" y="${H - m.b + 18}" text-anchor="middle">${lab} ${Number(r.date.slice(8))}日</text>`;
      const w = d.weather && d.weather[r.date];
      if (w) {
        s += `<text x="${cx}" y="${H - m.b + 42}" text-anchor="middle" style="font-size:17px">${w.emoji}</text>`;
        if (w.tmax != null) s += `<text x="${cx}" y="${H - m.b + 58}" text-anchor="middle" style="fill:var(--faint);font-size:10.5px">${Math.round(w.tmax)}°/${Math.round(w.tmin)}°</text>`;
      }
    });
    $("hchart").innerHTML = s;
  }

  function renderData(d) {
    renderHead(d);
    renderKpis(d);
    if (d.mode === "week") renderWeekChart(d); else renderChart(d);
    renderEntrances(d);
  }

  async function load(dateStr) {
    setDateLabel(dateStr);
    $("liveTxt").textContent = "更新中…";
    const btn = $("refreshBtn");
    if (btn) btn.disabled = true;
    loadWeather(dateStr);
    try {
      const bust = `&_=${Date.now()}`; // CDNキャッシュを回避して常に最新を取得
      const reqs = [fetch(`/api/occupancy?date=${dateStr}&range=${mode}${bust}`, { cache: "no-store" }).then((r) => r.json())];
      if (mode === "week") reqs.push(fetch(`/api/weather?date=${dateStr}&range=week${bust}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null));
      const [d, wx] = await Promise.all(reqs);
      if (d.error) throw new Error(d.error);
      if (mode === "week" && wx && wx.daily) { d.weather = {}; wx.daily.forEach((x) => { d.weather[x.date] = x; }); }
      current = d;
      renderData(d);
      const jt = new Date(new Date(d.updatedAt).getTime() + 9 * 3600 * 1000), p = (n) => String(n).padStart(2, "0");
      const hhmmss = `${p(jt.getUTCHours())}:${p(jt.getUTCMinutes())}:${p(jt.getUTCSeconds())}`;
      $("apiTime").textContent = hhmmss;
      $("liveTxt").textContent = `${p(jt.getUTCHours())}:${p(jt.getUTCMinutes())} 時点`;
    } catch (e) {
      $("liveTxt").textContent = "取得エラー";
      $("chartHost").innerHTML = `<div class="state err">データ取得に失敗しました：${e.message}</div>`;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  const pick = $("datePick");
  pick.value = jstTodayStr();
  pick.max = jstTodayStr();
  pick.addEventListener("change", () => load(pick.value));

  const seg = $("modeSeg");
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.dataset.mode === mode) return;
    mode = b.dataset.mode;
    Array.from(seg.children).forEach((x) => x.classList.toggle("on", x === b));
    load(pick.value);
  });

  $("refreshBtn").addEventListener("click", () => load(pick.value));

  load(pick.value);
  timers.push(setInterval(() => { if (pick.value === jstTodayStr()) load(pick.value); }, 60000));

  const mo = new MutationObserver(() => { if (current) { if (current.mode === "week") renderWeekChart(current); else renderChart(current); } });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  return () => { timers.forEach(clearInterval); mo.disconnect(); };
}

export default function Page() {
  useEffect(() => {
    const cleanup = boot();
    return cleanup;
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: MARKUP }} />;
}
