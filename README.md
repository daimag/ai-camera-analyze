# AI Camera Analyze — PSJ新下関店 入退店ダッシュボード

Verkada AIカメラの「混雑傾向ライン（People Counting Line）」の入退店カウントを
**Verkada Command 公開API**から取得し、ブラウザで可視化する **Next.js** ダッシュボードです。
天気（下関市）は **Open-Meteo**（APIキー不要）から取得します。**Vercel** 上で動作します。

## 画面
- 日付・曜日・現在時刻（JST・毎秒更新）・下関の天気
- KPI：総入店 / 総退店 / 店内滞在ピーク / 主入口
- 時間帯別 入退店グラフ＋店内滞在ライン（当日は3分ごと自動更新）
- 入口（カメラ）別 入店数
- 使用API解説（業者向け）

## 構成（Next.js App Router）
```
app/page.js               … ダッシュボード（クライアント）
app/layout.js             … レイアウト・メタ情報
app/globals.css           … スタイル
app/api/occupancy/route.js … Verkada occupancy_trends を集計（要 VERKADA_API_KEY）
app/api/weather/route.js   … Open-Meteo から下関の天気（キー不要）
```

## ローカル実行
```
npm install
# .env.local に VERKADA_API_KEY=... を記載
npm run dev        # http://localhost:3000
```

## Vercelデプロイ（git自動連携）
1. GitHub リポジトリを Vercel にインポート（Framework: Next.js は自動検出）
2. **Project Settings → Environment Variables** に `VERKADA_API_KEY` を追加
3. `main` へ push すると自動でビルド＆デプロイ

## 計測仕様の注意
- 入退店は Command で設定した混雑傾向ラインに基づく実測カウント（2026-07-08 設定）。
- ラインは**遡及計測不可**。設定日以降のデータのみ取得できます。
- 当日分は営業中の速報値で、時間とともに更新されます。
