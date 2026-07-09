// 検索エンジンに一切インデックスさせない（全クローラを全パス拒否）
export default function robots() {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
