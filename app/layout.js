import "./globals.css";

export const metadata = {
  title: "PSJ新下関店 入退店アナリティクス",
  description: "Verkada AIカメラ＋公開APIによる来店計測ダッシュボード（日付・曜日・時刻・天気つき）",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
