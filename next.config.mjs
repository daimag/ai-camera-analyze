/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // 全ページ・全APIで検索エンジンのインデックスを禁止
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
        ],
      },
    ];
  },
};
export default nextConfig;
