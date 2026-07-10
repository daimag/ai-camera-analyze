# 入退店ダッシュボード ドキュメント

PSJ新下関店（パチンコ）の入退店を Verkada 公開API から取得し可視化する Next.js アプリ。

- 本番: https://ai-camera-analyze.vercel.app/
- リポジトリ: https://github.com/daimag/ai-camera-analyze
- 構成: Next.js 14（App Router）/ Vercel サーバーレス / 天気 = Open-Meteo

---

## 1. できること（実装済み）

### 表示・グラフ
- **表示単位トグル**：日 / 週（曜日別）/ 月（日別）
- **15分粒度ピーク分析**（日）：1時間↔15分を切替。最混雑の15分スロットに「ピーク」表示
- **2日重ね比較**（日）：先週同曜/前日と入店ラインを重ね、増減%を表示
- **入店をカメラ別に色分け**（積み上げ）＋カメラ凡例。入口別リストも同色
- **店内滞在ライン**（推定・右軸）、**進行中の時間は「速報」**表示
- **天気**：現在（ヘッダー）＋週ビューは各曜日の下に絵文字・最高/最低気温（Open-Meteo・下関）
- 日付・曜日・現在時刻（JST毎秒）・API最新取得時刻・「↻更新」（右上）

### KPI（日ビュー・6枚）
- 総入店 / 総退店
- 店内滞在（現在／過去日は終値）
- 滞在ピーク
- **平均滞在時間**（推定・リトルの法則 = 滞在人時 ÷ 入店）
- **朝一比率**（午前ピーク時入店 ÷ 総入店）
- **車客比率**（立体駐車場 ÷ 総入店）

### 分析サマリー（Step1・グラフ下・日ビュー）
- 🌆 **夕方ラッシュ指数**（17-19時の入店割合＝夜型度）
- ⛰️ **来店パターン**（朝/夕ピークから二峰型 or 朝一集中型を判定）
- 🚪 **入口の時間差**（朝と夕の主入口シフト＝客層変化）
- ⚠️ **退店超過ピーク**（昼間帯10-18時／空き台不足・見切りの目安）

### 週/月KPI
- 週(月)合計 入店/退店・1営業日あたり平均（設定日/休業日は除外）・最多来店日

---

## 2. 使用API

### Verkada 公開REST API（api.verkada.com・APIキー認証）
```
POST /token                                   # x-api-key → 認証トークン
GET  /cameras/v1/analytics/occupancy_trends    # 入退店（混雑傾向ライン）
     ?camera_id=..&preset_id=..&start_time=..&end_time=..&interval=1_hour|15_minutes|1_day
     → trend_in / trend_out = [開始秒, 終了秒, 人数] の配列
```
- **preset_id はカメラごと**（config相当は `app/api/occupancy/route.js` の CAMERAS 配列）。
- 集計方式：日=1_hour、週/月=1_day（Verkadaウィジェットと一致）、15分=15_minutes。
- **キャッシュ無効化必須**：ルートに `fetchCache='force-no-store'` ＋ 各fetchに `cache:'no-store'`（でないと最新が固定表示される）。

### Open-Meteo（天気・APIキー不要）
```
GET https://api.open-meteo.com/v1/forecast?latitude=34.0083&longitude=130.9414&...&timezone=Asia/Tokyo
```

---

## 3. 重要な仕様・制約

- **混雑傾向ラインは 2026-07-08 設定。遡及計測不可**（設定日以降のみ取得可）。
- **preset_id は公開APIで一覧不可**（403）。過去にHAR解析で各カメラのIDを取得済み。
  - ラインを引き直すと **preset_id が変わりアプリが停止** → 再取得が必要。
- **性別・年齢などの人物属性**：Verkadaは推定しているが**公開APIでは403**（内部 `person_attributes` API＝セッション認証のみ、自動化困難）。
- **車両台数**：立体駐車場カメラは歩行者を映す画角で `vehicle_count=0`（車は数えられない）。
- **本番はライブAPI取得（保存なし）**。長期トレンド分析（下記）はデータ蓄積が別途必要。

---

## 4. 今後の拡張提案（アプリ下部の提案セクションにも掲載）

| # | 指標 | 実現条件 |
|---|---|---|
| 稼働率（占有率） | 現在滞在 ÷ 総台数 | **総台数の登録** |
| 年金・給料日 効果 | 支給日と来店の相関 | データ蓄積 |
| 天気 × 来店 相関 | 雨・気温との回帰 | データ蓄積 |
| 曜日×時間 ヒートマップ／混雑予報 | — | データ蓄積 |
| 客層推定（男女比・年齢層） | 自前AI or Verkada属性API開放 | 要検討 |
| ナンバー認識(LPR)商圏分析 | リピート/遠方率 | LPRライセンス |

- **蓄積が要る分析**は、Vercel の Cron + DB（Postgres/KV）で毎日収集する構成が理想。
- **Webhooks**（Verkada）が使えれば、リアルタイムPUSH＋自前蓄積が可能（イベント種別は要確認）。

---

## 5. ローカル開発 / デプロイ

```bash
npm install
# .env.local に VERKADA_API_KEY=... を記載
npm run dev            # http://localhost:3000
```
- Vercel：Framework Preset = **Next.js**、環境変数 **VERKADA_API_KEY** を設定 → main へ push で自動デプロイ。
- **検索エンジン非公開**：noindex メタ / robots.txt 全拒否 / X-Robots-Tag ヘッダ。画面から店舗特定情報は削除済み。

---

## 6. 別系統（CSV運用版・参考）

`C:\Users\user\Desktop\verkadaapi` に、公開API＋preset_idでCSV蓄積する Python 版も存在：
- `collect_occupancy.py`（収集→data/occupancy_hourly.csv）
- `graph_occupancy.py`（日次/月次グラフPNG）
- `config.py`（APIキー・CAMERA_PRESETS）
