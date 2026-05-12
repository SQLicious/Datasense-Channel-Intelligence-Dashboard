"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { DerivedCommentInsights } from "../../src/lib/comment-insights/derive";
import type {
  CommentInsightsSnapshot,
  ContentIdea,
  CountShare,
  CreatorInsight,
  FrequentQuestion,
  RawComment,
  ReplyOpportunity,
} from "../../src/lib/comment-insights/types";

type Tab = "Overview" | "Topics" | "Questions" | "Content Ideas" | "Reply Queue" | "Raw Comments";

const TABS: Tab[] = ["Overview", "Topics", "Questions", "Content Ideas", "Reply Queue", "Raw Comments"];

type LiveStatus = {
  currentMode?: string;
  oauthConnected?: boolean;
  lastSyncFinishedAt?: string;
  videosSeen?: number;
  commentsSeen?: number;
  warnings?: number;
  publicSyncRateLimit?: {
    blocked?: boolean;
    retryAt?: string;
    remainingAttempts?: number;
  };
};

export default function DashboardClient({
  snapshot,
  derived,
}: {
  snapshot: CommentInsightsSnapshot;
  derived: DerivedCommentInsights;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const status = { ...(snapshot.syncStatus || {}), ...(liveStatus || {}) };

  useEffect(() => {
    async function refreshStatus() {
      try {
        const [dataResponse, statusResponse] = await Promise.all([
          fetch("/api/youtube/data", { cache: "no-store" }),
          fetch("/api/youtube/status", { cache: "no-store" }),
        ]);
        if (!dataResponse.ok || !statusResponse.ok) return;
        const body = await dataResponse.json();
        const statusBody = await statusResponse.json();
        setLiveStatus({
          currentMode: body.lastSync?.accessMode || body.channel?.accessMode,
          oauthConnected: Boolean(body.oauthConnected),
          lastSyncFinishedAt: body.lastSync?.finishedAt,
          videosSeen: body.lastSync?.videosSeen,
          commentsSeen: body.lastSync?.commentsSeen,
          warnings: body.lastSync?.warnings?.length ?? 0,
          publicSyncRateLimit: statusBody.publicSyncRateLimit,
        });
      } catch {
        setLiveStatus(null);
      }
    }

    void refreshStatus();
  }, []);

  async function sync(accessMode: "public_only" | "owner_connected") {
    setBusy(accessMode);
    setSyncError(null);

    try {
      const response = await fetch("/api/youtube/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessMode,
          includeReplies: false,
          maxComments: 1000,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Sync failed.");
      }
      window.location.reload();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="studioShell">
      <Hero snapshot={snapshot} />
      <OperationsPanel snapshot={snapshot} status={status} busy={busy} syncError={syncError} onSync={sync} />

      <nav className="studioTabs" aria-label="Comment insight sections">
        {TABS.map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)} type="button">
            <span>{tab}</span>
            <strong>{formatCompact(derived.tabBadges[tab] || 0)}</strong>
          </button>
        ))}
      </nav>

      {activeTab === "Overview" ? (
        <Overview snapshot={snapshot} derived={derived} status={status} />
      ) : null}
      {activeTab === "Topics" ? <Topics snapshot={snapshot} /> : null}
      {activeTab === "Questions" ? <Questions questions={snapshot.frequentQuestions} /> : null}
      {activeTab === "Content Ideas" ? <ContentIdeas ideas={snapshot.contentIdeas} /> : null}
      {activeTab === "Reply Queue" ? <ReplyQueue replies={snapshot.replyOpportunities} /> : null}
      {activeTab === "Raw Comments" ? <RawComments comments={snapshot.rawComments} /> : null}
    </main>
  );
}

function Hero({ snapshot }: { snapshot: CommentInsightsSnapshot }) {
  return (
    <header className="studioHero">
      <div className="heroCopy">
        <div className="brandRow">
          <div className="dataSenseMark" aria-hidden="true">
            {snapshot.brand.iconUrl ? <img src={snapshot.brand.iconUrl} alt="" /> : <span>DS</span>}
          </div>
          <div>
            <p className="eyebrow">DataSense channel intelligence</p>
            <h1>Channel Analytics</h1>
          </div>
        </div>
        <p className="heroLead">Public insights. Owner-powered depth.</p>
        <div className="heroActions">
          <a href={snapshot.brand.channelUrl} target="_blank" rel="noreferrer">
            Open channel
          </a>
          <span>{buildAnalysisCoverage(snapshot)}</span>
        </div>
      </div>
    </header>
  );
}

function OperationsPanel({
  snapshot,
  busy,
  syncError,
  onSync,
  status,
}: {
  snapshot: CommentInsightsSnapshot;
  status: LiveStatus;
  busy: string | null;
  syncError: string | null;
  onSync: (accessMode: "public_only" | "owner_connected") => void;
}) {
  return (
    <section className="studioGrid operationsGrid">
      <article className="studioPanel connectionPanel">
        <PanelTitle eyebrow="connection" title="YouTube data controls" />
        <div className="connectionBody">
          <div>
            <p className="modeExplainer">
              This dashboard supports two data modes: <strong>public sync</strong> for public channel metrics and comments, and{" "}
              <strong>owner sync</strong> when the channel owner connects Google OAuth for deeper channel-authorized access.
            </p>
            <p>
              Current mode: <strong>{formatAccessMode(status.currentMode)}</strong>
            </p>
            <p>
              Owner OAuth: <strong>{status.oauthConnected ? "connected" : "not connected"}</strong>
            </p>
            <small>Public sync uses the API key. Owner sync uses the channel owner&apos;s approved Google access.</small>
          </div>
          <div className="syncActions">
            <button
              disabled={busy !== null || Boolean(status.publicSyncRateLimit?.blocked)}
              onClick={() => onSync("public_only")}
              type="button"
            >
              {busy === "public_only" ? "Syncing..." : "Sync public data"}
            </button>
            <a href="/api/auth/youtube/start">Connect owner OAuth</a>
            <button disabled={busy !== null || !status.oauthConnected} onClick={() => onSync("owner_connected")} type="button">
              {busy === "owner_connected" ? "Syncing..." : "Sync as owner"}
            </button>
          </div>
        </div>
        {status.publicSyncRateLimit?.blocked && status.publicSyncRateLimit.retryAt ? (
          <p className="cooldownNote">Public sync is limited to 2 runs per IP every 12 hours. Next public sync window: {formatDate(status.publicSyncRateLimit.retryAt)}.</p>
        ) : null}
        {!status.publicSyncRateLimit?.blocked && typeof status.publicSyncRateLimit?.remainingAttempts === "number" ? (
          <p className="cooldownNote">Public sync remaining in this 12-hour window for this IP: {status.publicSyncRateLimit.remainingAttempts}.</p>
        ) : null}
        {syncError ? <p className="syncError">{syncError}</p> : null}
      </article>
    </section>
  );
}

function Overview({
  snapshot,
  derived,
  status,
}: {
  snapshot: CommentInsightsSnapshot;
  derived: DerivedCommentInsights;
  status: LiveStatus;
}) {
  const metrics = snapshot.dashboard.metrics;
  const channelStats = snapshot.channelStats || {};

  return (
    <section className="tabPanel">

      <div className="metricGrid">
        <MetricCard label="Videos Uploaded" value={formatValue(channelStats.videosUploaded ?? metrics.videosRepresented)} accent="cyan" />
        <MetricCard label="Comments" value={formatValue(channelStats.commentsStored ?? metrics.commentsReviewed)} accent="teal" />
        <MetricCard label="Total Channel Views" value={formatValue(channelStats.totalChannelViews)} accent="coral" />
        <MetricCard label="Subscribers" value={formatValue(channelStats.subscribers)} accent="yellow" />
      </div>

      <div className="studioGrid statusGrid">
        <article className="studioPanel channelPanel">
          <PanelTitle eyebrow="channel" title={snapshot.channelProfile?.title || snapshot.brand.name} />
          <div className="channelBody">
            {snapshot.channelProfile?.thumbnailUrl ? <img src={snapshot.channelProfile.thumbnailUrl} alt="" /> : null}
            <p>{snapshot.channelProfile?.description || "No channel description available."}</p>
          </div>
        </article>

        <article className="studioPanel lastSyncPanel">
          <PanelTitle eyebrow="data freshness" title="Snapshot + API status" />
          <p className="freshnessNote">
            Dashboard insights come from the exported report snapshot: {formatValue(metrics.commentsReviewed)} comments across{" "}
            {formatValue(metrics.videosRepresented)} represented videos. The API sync below only shows the most recent public/owner sync attempt.
          </p>
          <dl>
            <div>
              <dt>Snapshot comments</dt>
              <dd>{formatValue(metrics.commentsReviewed)}</dd>
            </div>
            <div>
              <dt>Snapshot videos represented</dt>
              <dd>{formatValue(metrics.videosRepresented)}</dd>
            </div>
            <div>
              <dt>Last API mode</dt>
              <dd>{formatAccessMode(status.currentMode)}</dd>
            </div>
            <div>
              <dt>Last API finished</dt>
              <dd>{formatDate(status.lastSyncFinishedAt)}</dd>
            </div>
            <div>
              <dt>Last API videos touched</dt>
              <dd>{formatValue(status.videosSeen)}</dd>
            </div>
            <div>
              <dt>Last API comments touched</dt>
              <dd>{formatValue(status.commentsSeen)}</dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd>{formatValue(status.warnings)}</dd>
            </div>
          </dl>
        </article>
      </div>

      <div className="studioGrid overviewGrid">
        <article className="studioPanel largePanel">
          <PanelTitle eyebrow="category mix" title="What viewers are talking about" />
          <HorizontalBars items={snapshot.dashboard.categoryMix} total={derived.categoryTotal} />
        </article>

        <article className="studioPanel">
          <PanelTitle eyebrow="priority" title="Reply signal" />
          <DonutChart items={snapshot.dashboard.priorityMix} />
          <div className="priorityLegend">
            {snapshot.dashboard.priorityMix.map((item) => (
              <span key={item.name}>
                <i className={`dot ${item.name.toLowerCase()}`} />
                {item.name}: {item.count}
              </span>
            ))}
          </div>
        </article>

        <article className="studioPanel">
          <PanelTitle eyebrow="tool radar" title="Top mentioned tools" />
          <ToolCloud tools={snapshot.dashboard.topTools} />
        </article>

        <article className="studioPanel largePanel nextPanel">
          <PanelTitle eyebrow="creator moves" title="What to do next" />
          <div className="moveList">
            {derived.nextMoves.map((move, index) => (
              <div key={move} className="moveCard">
                <span>{index + 1}</span>
                <p>{move}</p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function Topics({ snapshot }: { snapshot: CommentInsightsSnapshot }) {
  return (
    <section className="tabPanel">
      <div className="sectionIntro">
        <p className="eyebrow">Topic clusters</p>
        <h2>Ranked creator signals from comments</h2>
        <p>Each card combines volume, representative comments, affected videos, and the recommended creator action.</p>
      </div>
      <div className="topicGrid">
        {snapshot.creatorInsights.map((insight, index) => (
          <TopicCard key={insight.pattern} insight={insight} rank={index + 1} />
        ))}
      </div>
    </section>
  );
}

function Questions({ questions }: { questions: FrequentQuestion[] }) {
  return (
    <section className="tabPanel">
      <div className="sectionIntro">
        <p className="eyebrow">Viewer questions</p>
        <h2>Recurring asks worth answering</h2>
        <p>Use these to decide reply copy, pinned comments, Shorts, and quick follow-up lessons.</p>
      </div>
      <div className="questionGrid">
        {questions.map((question) => (
          <QuestionCard key={question.questionTheme} question={question} />
        ))}
      </div>
    </section>
  );
}

function ContentIdeas({ ideas }: { ideas: ContentIdea[] }) {
  const [priority, setPriority] = useState("All");
  const filtered = priority === "All" ? ideas : ideas.filter((idea) => idea.priority === priority);

  return (
    <section className="tabPanel">
      <div className="sectionHeader">
        <div className="sectionIntro">
          <p className="eyebrow">Content lab</p>
          <h2>Evidence-backed video ideas</h2>
          <p>These are not generic ideas. They are backed by real viewer language from the exported report.</p>
        </div>
        <SegmentedControl value={priority} values={["All", "High", "Medium"]} onChange={setPriority} />
      </div>
      <div className="ideaGrid">
        {filtered.map((idea) => (
          <IdeaCard key={`${idea.idea}-${idea.suggestedTitleAngle}`} idea={idea} />
        ))}
      </div>
    </section>
  );
}

function ReplyQueue({ replies }: { replies: ReplyOpportunity[] }) {
  const [priority, setPriority] = useState("High");
  const filtered = priority === "All" ? replies : replies.filter((reply) => reply.priority === priority);

  return (
    <section className="tabPanel">
      <div className="sectionHeader">
        <div className="sectionIntro">
          <p className="eyebrow">Reply queue</p>
          <h2>Comments worth answering</h2>
          <p>Prioritized comments for direct replies, pinned answers, and future content prompts.</p>
        </div>
        <SegmentedControl value={priority} values={["High", "Medium", "All"]} onChange={setPriority} />
      </div>
      <div className="replyList">
        {filtered.map((reply, index) => (
          <ReplyCard key={`${reply.author}-${reply.comment}-${index}`} reply={reply} />
        ))}
      </div>
    </section>
  );
}

function RawComments({ comments }: { comments: RawComment[] }) {
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("All");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return comments
      .filter((comment) => priority === "All" || comment.priority === priority)
      .filter((comment) => {
        if (!needle) return true;
        return [comment.text, comment.videoTitle, comment.author, comment.category, comment.questionTheme].some((value) =>
          value.toLowerCase().includes(needle)
        );
      })
      .slice(0, 80);
  }, [comments, priority, query]);

  return (
    <section className="tabPanel">
      <div className="sectionHeader">
        <div className="sectionIntro">
          <p className="eyebrow">Audit trail</p>
          <h2>Raw comment explorer</h2>
          <p>Search the source comments behind the studio insights.</p>
        </div>
        <div className="tableControls">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search comments, videos, authors..." />
          <SegmentedControl value={priority} values={["All", "High", "Medium"]} onChange={setPriority} />
        </div>
      </div>

      <div className="commentTable" role="table" aria-label="Raw comments">
        <div className="commentTableHead" role="row">
          <span>Comment</span>
          <span>Video</span>
          <span>Signal</span>
        </div>
        {filtered.map((comment) => (
          <div className="commentTableRow" role="row" key={comment.commentId}>
            <div>
              <strong>{comment.author || "Unknown viewer"}</strong>
              <p>{comment.text}</p>
            </div>
            <span>{comment.videoTitle || "Untitled video"}</span>
            <div>
              <PriorityPill value={comment.priority} />
              <small>{comment.category || comment.questionTheme || "General"}</small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <article className={`metricCard ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PanelTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="panelTitle">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
    </div>
  );
}

function HorizontalBars({ items, total }: { items: CountShare[]; total: number }) {
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div className="barStack">
      {items.map((item) => (
        <div className="barItem" key={item.name}>
          <div>
            <strong>{item.name}</strong>
            <span>{formatPercent(item.share ?? item.count / Math.max(total, 1))}</span>
          </div>
          <div className="barTrack">
            <i style={{ width: `${Math.max(5, (item.count / max) * 100)}%` }} />
          </div>
          <small>{item.count} comments</small>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ items }: { items: CountShare[] }) {
  const total = Math.max(
    items.reduce((sum, item) => sum + item.count, 0),
    1
  );
  const high = items.find((item) => item.name === "High")?.count || 0;
  const highShare = Math.round((high / total) * 100);

  return (
    <div className="donutWrap">
      <div className="donut" style={{ "--high-share": `${highShare}%` } as CSSProperties}>
        <strong>{highShare}%</strong>
        <span>high signal</span>
      </div>
    </div>
  );
}

function ToolCloud({ tools }: { tools: CountShare[] }) {
  const max = Math.max(...tools.map((tool) => tool.count), 1);
  return (
    <div className="toolCloud">
      {tools.map((tool) => (
        <span key={tool.name} style={{ "--weight": `${tool.count / max}` } as CSSProperties}>
          {tool.name}
          <strong>{tool.count}</strong>
        </span>
      ))}
    </div>
  );
}

function TopicCard({ insight, rank }: { insight: CreatorInsight; rank: number }) {
  return (
    <article className="topicCard">
      <div className="topicTop">
        <span className="rank">#{rank}</span>
        <div>
          <h3>{insight.pattern}</h3>
          <p>
            {insight.count} comments / {formatPercent(insight.share)}
          </p>
        </div>
      </div>
      <blockquote>{insight.representativeComments[0] || "No representative comment available."}</blockquote>
      <p className="actionText">{insight.recommendedAction}</p>
      <div className="videoChips">
        {insight.affectedVideos.slice(0, 3).map((video) => (
          <span key={video}>{video}</span>
        ))}
      </div>
    </article>
  );
}

function QuestionCard({ question }: { question: FrequentQuestion }) {
  return (
    <article className="questionCard">
      <div className="cardTop">
        <h3>{question.questionTheme}</h3>
        <span>{question.beginnerOrAdvanced || "Viewer need"}</span>
      </div>
      <strong>{question.count} comments</strong>
      <p>{question.suggestedAnswerAngle}</p>
      <div className="quoteWall">
        {question.exampleQuestions.slice(0, 3).map((example) => (
          <blockquote key={example}>{example}</blockquote>
        ))}
      </div>
    </article>
  );
}

function IdeaCard({ idea }: { idea: ContentIdea }) {
  return (
    <article className="ideaCard">
      <div className="cardTop">
        <PriorityPill value={idea.priority} />
        <span>{idea.evidenceCount} comments</span>
      </div>
      <h3>{idea.suggestedTitleAngle || idea.idea}</h3>
      <p>{idea.idea}</p>
      <blockquote>{idea.sourceComments[0] || "No source comment available."}</blockquote>
    </article>
  );
}

function ReplyCard({ reply }: { reply: ReplyOpportunity }) {
  return (
    <article className="replyCard">
      <div className="replyMeta">
        <strong>{reply.author || "Unknown viewer"}</strong>
        <PriorityPill value={reply.priority} />
      </div>
      <p>{reply.comment}</p>
      <div className="replyContext">
        <span>{reply.video}</span>
        <small>{reply.reasonFlagged}</small>
      </div>
      <div className="replyAction">{reply.suggestedReplyAction}</div>
    </article>
  );
}

function PriorityPill({ value }: { value: string }) {
  return <span className={`priorityPill ${value.toLowerCase()}`}>{value}</span>;
}

function SegmentedControl({
  value,
  values,
  onChange,
}: {
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented">
      {values.map((item) => (
        <button key={item} className={item === value ? "active" : ""} onClick={() => onChange(item)} type="button">
          {item}
        </button>
      ))}
    </div>
  );
}

function formatNumber(value: number | string) {
  return Number(value || 0).toLocaleString();
}

function formatValue(value: number | string | undefined) {
  if (value === undefined || value === "") return "-";
  return typeof value === "number" ? value.toLocaleString() : value;
}

function formatDate(value: string | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAccessMode(value: string | undefined) {
  return value === "owner_connected" ? "owner connected" : "public only";
}

function buildAnalysisCoverage(snapshot: CommentInsightsSnapshot) {
  const generatedAt = snapshot.dashboard.subtitle.match(/Generated\s+(.+?)\.$/)?.[1] || "the latest exported report";
  return `A comprehensive analysis of ${formatValue(snapshot.dashboard.metrics.commentsReviewed)} comments across recent DataSense videos, generated on ${generatedAt}.`;
}

function formatCompact(value: number) {
  return Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
