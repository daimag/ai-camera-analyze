// ルート（/）は何も公開しない。ダッシュボードは /psj・/toyo などの個別パスのみ。
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Home() {
  notFound();
}
