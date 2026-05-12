import { deriveCommentInsights } from "../src/lib/comment-insights/derive";
import { loadCommentInsightsSnapshot } from "../src/lib/comment-insights/load";
import DashboardClient from "./ui/dashboard-client";

export const dynamic = "force-static";

export default async function Home() {
  const result = await loadCommentInsightsSnapshot();

  if (result.status === "missing") {
    return (
      <main className="missingSnapshot">
        <div>
          <p className="eyebrow">DataSense AI Studio</p>
          <h1>Comment snapshot is not ready</h1>
          <p>{result.message}</p>
          <code>npm run export:comments</code>
        </div>
      </main>
    );
  }

  const derived = deriveCommentInsights(result.snapshot);

  return <DashboardClient snapshot={result.snapshot} derived={derived} />;
}
