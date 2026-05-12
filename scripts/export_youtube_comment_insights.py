from __future__ import annotations

import json
import os
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

import requests
import xlsxwriter
from xlsxwriter.utility import xl_cell_to_rowcol, xl_col_to_name


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output"
output_override = os.environ.get("COMMENT_INSIGHTS_OUTPUT")
OUTPUT_FILE = (ROOT / output_override).resolve() if output_override else OUTPUT_DIR / "datasense-youtube-comment-insights.xlsx"
DEFAULT_COMMENT_LIMIT = 1000

DARK = "#062134"
TEAL = "#006d72"
CYAN = "#00e7ff"
LIGHT_BLUE = "#BDEAF4"
PALE_BLUE = "#E9FAFC"
GRID = "#8FC7D0"
WHITE = "#FFFFFF"
GREY = "#EEF4F5"

CATEGORY_KEYWORDS: list[tuple[str, list[str]]] = [
    ("Access/setup help", ["install", "setup", "error", "issue", "stuck", "where do i", "not working", "can't", "cannot", "api", "oauth", "key", "environment", "github", "download", "configure"]),
    ("Question", ["?", "how do", "how can", "what is", "what are", "which", "where", "why", "can you", "could you", "should i"]),
    ("Mode/tool choice", ["tool", "claude", "codex", "chatgpt", "gemini", "cursor", "mcp", "api", "model", "llm", "agent", "agents", "langgraph", "crewai", "supabase", "vercel", "pinecone"]),
    ("Workflow build", ["workflow", "automation", "build", "project", "demo", "step by step", "tutorial", "example", "repo", "template"]),
    ("Learning/resource request", ["course", "learn", "roadmap", "playlist", "resource", "beginner", "teach", "training"]),
    ("Business/application", ["business", "client", "enterprise", "production", "company", "job", "career", "resume", "interview", "portfolio", "use case"]),
    ("Cost/pricing", ["price", "pricing", "cost", "paid", "free", "subscription", "expensive", "cheap"]),
    ("Positive feedback", ["great", "thanks", "thank you", "helpful", "love", "awesome", "amazing", "excellent", "valuable", "clear"]),
    ("General feedback", []),
]

TOOL_KEYWORDS = [
    "Claude Code",
    "Claude",
    "Codex",
    "ChatGPT",
    "Gemini",
    "OpenAI",
    "MCP",
    "API",
    "Supabase",
    "Vercel",
    "LangGraph",
    "CrewAI",
    "Pinecone",
    "Cursor",
    "GitHub",
    "Python",
    "SQL",
    "RAG",
]


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def supabase_get(table: str, params: dict[str, str], env: dict[str, str]) -> list[dict[str, Any]]:
    url = env["SUPABASE_URL"].rstrip("/") + f"/rest/v1/{table}"
    headers = {
        "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}",
        "Accept": "application/json",
    }
    response = requests.get(url, headers=headers, params=params, timeout=60)
    response.encoding = "utf-8"
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase request failed for {table}: {response.status_code} {response.text}")
    return response.json()


def fetch_recent_comments(env: dict[str, str]) -> list[dict[str, Any]]:
    comment_limit = int(env.get("COMMENT_ANALYSIS_LIMIT") or DEFAULT_COMMENT_LIMIT)
    return supabase_get(
        "youtube_comments",
        {
            "select": "*",
            "order": "published_at.desc.nullslast",
            "limit": str(comment_limit),
        },
        env,
    )


def clean_text(value: str | None, limit: int = 30000) -> str:
    text = unicodedata.normalize("NFKC", value or "")
    text = "".join(ch for ch in text if unicodedata.category(ch)[0] != "C")
    return re.sub(r"\s+", " ", text).strip()[:limit]


def excerpt(value: str | None, limit: int = 260) -> str:
    text = clean_text(value, limit + 40)
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def normalize_video_title(value: str | None) -> str:
    title = clean_text(value, 220)
    title = re.sub(r"\s*\|\s*", " | ", title)
    title = re.sub(r"\s*:\s*", ": ", title)
    title = re.sub(r"\s+#\w+", "", title)
    title = re.sub(r"[|]{2,}", "|", title)
    title = title.replace("–", "-").replace("—", "-")
    title = re.sub(r"\s+", " ", title).strip(" |")
    return title


def contains_any(text: str, terms: list[str]) -> bool:
    lowered = text.lower()
    return any(term.lower() in lowered for term in terms)


def classify_category(text: str) -> str:
    lowered = text.lower()
    for category, keywords in CATEGORY_KEYWORDS:
        if keywords and any(keyword in lowered for keyword in keywords):
            return category
    return "General feedback"


def question_theme(category: str, text: str) -> str:
    lowered = text.lower()
    if any(term in lowered for term in ["install", "setup", "error", "api", "key", "connect", "github"]):
        return "Setup/connectivity"
    if any(term in lowered for term in ["tool", "claude", "codex", "gemini", "mcp", "model", "api"]):
        return "Mode/tool choice"
    if any(term in lowered for term in ["workflow", "automation", "build", "project", "agent"]):
        return "Workflow build"
    if any(term in lowered for term in ["learn", "course", "roadmap", "beginner", "resource"]):
        return "Learning/resource request"
    if any(term in lowered for term in ["price", "cost", "paid", "free"]):
        return "Cost/pricing"
    if any(term in lowered for term in ["business", "client", "job", "career", "portfolio"]):
        return "Business application"
    return "General question" if category == "Question" else category


def level_for_question(theme: str, text: str) -> str:
    lowered = text.lower()
    if any(term in lowered for term in ["production", "enterprise", "client", "architecture", "scale", "advanced"]):
        return "Operator/advanced"
    return "Beginner"


def suggested_answer_angle(theme: str) -> str:
    mapping = {
        "Setup/connectivity": "Give exact setup steps, common mistakes, and what success looks like.",
        "Mode/tool choice": "Compare the practical tradeoffs and recommend one starting path.",
        "Workflow build": "Show the workflow end to end with inputs, outputs, and failure points.",
        "Learning/resource request": "Answer directly, then point to the simplest next resource.",
        "Cost/pricing": "Explain realistic costs, free/paid limits, and when the tool is worth it.",
        "Business application": "Show the revenue/use-case math and a simple client-ready workflow.",
    }
    return mapping.get(theme, "Answer directly, then point to the simplest next action.")


def priority_for(row: dict[str, Any], category_count: int) -> str:
    score = 0
    if row["category"] in {"Access/setup help", "Question", "Workflow build", "Mode/tool choice"}:
        score += 3
    if row["likes"] > 0:
        score += min(row["likes"], 5)
    if category_count >= 15:
        score += 3
    if category_count >= 8:
        score += 2
    return "High" if score >= 6 else "Medium" if score >= 3 else "Low"


def action_for_category(category: str) -> str:
    mapping = {
        "Access/setup help": "Make a short troubleshooting walkthrough and pin a comment with the fix.",
        "Question": "Answer this in a comment, community post, or future video segment.",
        "Mode/tool choice": "Create a comparison segment with a clear recommendation.",
        "Workflow build": "Turn this into a practical build-along tutorial.",
        "Learning/resource request": "Create a concise roadmap or resource list.",
        "Cost/pricing": "Explain realistic costs and when paid tiers are worth it.",
        "Business/application": "Package this as a real-world use case or client workflow.",
        "Positive feedback": "Acknowledge and reuse as proof of what resonated.",
    }
    return mapping.get(category, "Address this theme in a comment reply, community post, or future video segment.")


def title_angle(idea: str, category: str) -> str:
    mapping = {
        "Access/setup help": "I Fixed the Setup Problems Everyone Hits With AI Tools",
        "Question": "Viewer Questions About AI Workflows, Answered",
        "Mode/tool choice": "Which AI Coding Tool Should You Actually Use?",
        "Workflow build": "Build the Workflow Viewers Keep Asking For Step by Step",
        "Learning/resource request": "The Practical Learning Path for AI Builders",
        "Cost/pricing": "What These AI Tools Really Cost in Production",
        "Business/application": "A Client-Ready AI Workflow You Can Actually Sell",
        "Positive feedback": "What Viewers Found Most Useful and What To Build Next",
    }
    return mapping.get(category, idea)


def analyze(comments: list[dict[str, Any]]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for comment in comments:
        text = clean_text(comment.get("text"))
        category = classify_category(text)
        q_theme = question_theme(category, text)
        tools = [tool for tool in TOOL_KEYWORDS if re.search(rf"\b{re.escape(tool)}\b", text, re.I)]
        rows.append(
            {
                "videoTitle": normalize_video_title(comment.get("video_title")),
                "videoId": comment.get("video_id") or "",
                "commentId": comment.get("comment_id") or "",
                "author": comment.get("author_display_name") or "",
                "authorChannelId": comment.get("author_channel_id") or "",
                "text": text,
                "likes": int(comment.get("like_count") or 0),
                "publishedAt": comment.get("published_at") or "",
                "category": category,
                "questionTheme": q_theme,
                "beginnerOrAdvanced": level_for_question(q_theme, text),
                "tools": tools,
                "isQuestion": "Yes" if ("?" in text or category == "Question") else "No",
            }
        )

    category_counts = Counter(row["category"] for row in rows)
    question_counts = Counter(row["questionTheme"] for row in rows if row["isQuestion"] == "Yes" or row["category"] in {"Question", "Access/setup help", "Mode/tool choice", "Workflow build"})
    tool_counts = Counter(tool for row in rows for tool in row["tools"])
    video_counts = Counter(row["videoTitle"] for row in rows)

    for row in rows:
        row["priority"] = priority_for(row, category_counts[row["category"]])
        row["reasonFlagged"] = reason_flagged(row)
        row["recommendedReply"] = suggested_answer_angle(row["questionTheme"]) if row["isQuestion"] == "Yes" else action_for_category(row["category"])

    creator_rows = []
    for category, count in category_counts.most_common():
        affected = [excerpt(title, 58) for title, _ in Counter(row["videoTitle"] for row in rows if row["category"] == category).most_common(3)]
        examples = [excerpt(row["text"], 170) for row in rows if row["category"] == category][:3]
        creator_rows.append(
            {
                "pattern": category,
                "count": count,
                "share": count / max(len(rows), 1),
                "affectedVideos": "\n".join(affected),
                "representativeComments": " | ".join(examples),
                "recommendedAction": action_for_category(category),
            }
        )

    question_rows = []
    grouped_questions: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row["isQuestion"] == "Yes" or row["category"] in {"Question", "Access/setup help", "Mode/tool choice", "Workflow build"}:
            grouped_questions[row["questionTheme"]].append(row)
    for theme, items in grouped_questions.items():
        question_rows.append(
            {
                "questionTheme": theme,
                "count": len(items),
                "beginnerOrAdvanced": Counter(item["beginnerOrAdvanced"] for item in items).most_common(1)[0][0],
                "exampleQuestions": " | ".join(excerpt(item["text"], 190) for item in items[:4]),
                "suggestedAnswerAngle": suggested_answer_angle(theme),
            }
        )
    question_rows.sort(key=lambda item: -item["count"])

    content_rows = []
    for creator in creator_rows:
        content_rows.append(
            {
                "idea": f"{creator['pattern']}: make a practical follow-up or comparison",
                "evidenceCount": creator["count"],
                "suggestedTitleAngle": title_angle(creator["pattern"], creator["pattern"]),
                "priority": "High" if creator["count"] >= 10 else "Medium",
                "sourceComments": creator["representativeComments"],
            }
        )
    for question in question_rows[:6]:
        content_rows.append(
            {
                "idea": f"{question['questionTheme']}: answer the recurring viewer question",
                "evidenceCount": question["count"],
                "suggestedTitleAngle": title_angle(question["questionTheme"], question["questionTheme"]),
                "priority": "High" if question["count"] >= 8 else "Medium",
                "sourceComments": question["exampleQuestions"],
            }
        )
    content_rows.sort(key=lambda item: (-item["evidenceCount"], item["idea"]))

    reply_rows = sorted(
        [
            {
                "priority": row["priority"],
                "author": row["author"],
                "comment": excerpt(row["text"], 260),
                "video": excerpt(row["videoTitle"], 78),
                "reasonFlagged": row["reasonFlagged"],
                "suggestedReplyAction": row["recommendedReply"],
            }
            for row in rows
            if row["priority"] in {"High", "Medium"} and (row["isQuestion"] == "Yes" or row["category"] in {"Access/setup help", "Mode/tool choice", "Workflow build", "Positive feedback"})
        ],
        key=lambda item: (0 if item["priority"] == "High" else 1, item["video"]),
    )

    return {
        "rows": rows,
        "category_counts": category_counts,
        "question_counts": question_counts,
        "tool_counts": tool_counts,
        "video_counts": video_counts,
        "creator_rows": creator_rows,
        "question_rows": question_rows,
        "content_rows": content_rows,
        "reply_rows": reply_rows,
    }


def reason_flagged(row: dict[str, Any]) -> str:
    if row["category"] == "Access/setup help":
        return "Viewer may be stuck or asking setup help."
    if row["isQuestion"] == "Yes":
        return "Question worth answering."
    if row["category"] == "Positive feedback":
        return "Engaged positive comment."
    if row["category"] == "Mode/tool choice":
        return "Viewer is comparing tools or models."
    if row["category"] == "Workflow build":
        return "Viewer is asking for a practical build."
    return "Useful audience signal."


def fmt(workbook: xlsxwriter.Workbook) -> dict[str, Any]:
    return {
        "title": workbook.add_format({"bold": True, "font_size": 16, "font_color": WHITE, "bg_color": DARK, "valign": "vcenter"}),
        "subtitle": workbook.add_format({"bold": True, "font_size": 10, "font_color": WHITE, "bg_color": DARK, "valign": "top"}),
        "header": workbook.add_format({"bold": True, "font_size": 10, "font_color": WHITE, "bg_color": TEAL, "border": 1, "border_color": GRID, "align": "center", "valign": "vcenter"}),
        "cell": workbook.add_format({"font_size": 9, "text_wrap": True, "valign": "top", "border": 1, "border_color": GRID}),
        "cell_alt": workbook.add_format({"font_size": 9, "text_wrap": True, "valign": "top", "bg_color": LIGHT_BLUE, "border": 1, "border_color": GRID}),
        "num": workbook.add_format({"valign": "top", "border": 1, "border_color": GRID}),
        "num_alt": workbook.add_format({"valign": "top", "bg_color": LIGHT_BLUE, "border": 1, "border_color": GRID}),
        "pct": workbook.add_format({"num_format": "0.0%", "valign": "top", "border": 1, "border_color": GRID}),
        "pct_alt": workbook.add_format({"num_format": "0.0%", "valign": "top", "bg_color": LIGHT_BLUE, "border": 1, "border_color": GRID}),
        "kpi_label": workbook.add_format({"bold": True, "font_color": TEAL, "bg_color": PALE_BLUE, "align": "center", "border": 1, "border_color": CYAN}),
        "kpi_value": workbook.add_format({"bold": True, "font_size": 14, "font_color": DARK, "bg_color": PALE_BLUE, "align": "center", "border": 1, "border_color": CYAN}),
        "note": workbook.add_format({"text_wrap": True, "valign": "top", "bg_color": PALE_BLUE, "border": 1, "border_color": CYAN}),
    }


def setup_sheet(ws: xlsxwriter.worksheet.Worksheet, title: str, subtitle: str, formats: dict[str, Any], widths: list[int]) -> None:
    ws.hide_gridlines(2)
    ws.set_landscape()
    ws.set_paper(9)
    ws.fit_to_pages(1, 0)
    ws.set_margins(left=0.25, right=0.25, top=0.35, bottom=0.35)
    ws.set_row(0, 26)
    ws.set_row(1, 20)
    ws.merge_range(0, 0, 0, max(5, len(widths) - 1), title, formats["title"])
    ws.merge_range(1, 0, 1, max(5, len(widths) - 1), subtitle, formats["subtitle"])
    for idx, width in enumerate(widths):
        ws.set_column(idx, idx, width)


def write_table(
    ws: xlsxwriter.worksheet.Worksheet,
    start_row: int,
    start_col: int,
    headers: list[str],
    rows: list[dict[str, Any]],
    formats: dict[str, Any],
    percent_cols: set[str] | None = None,
    autofilter: bool = True,
) -> None:
    percent_cols = percent_cols or set()
    for col, header in enumerate(headers):
        ws.write(start_row, start_col + col, header, formats["header"])
    for ridx, row in enumerate(rows, start=start_row + 1):
        alt = (ridx - start_row) % 2 == 1
        max_len = 0
        for col, header in enumerate(headers):
            value = row.get(header, "")
            max_len = max(max_len, len(str(value)))
            if header in percent_cols:
                ws.write_number(ridx, start_col + col, float(value or 0), formats["pct_alt" if alt else "pct"])
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                ws.write_number(ridx, start_col + col, value, formats["num_alt" if alt else "num"])
            else:
                ws.write(ridx, start_col + col, value, formats["cell_alt" if alt else "cell"])
        if max_len > 450:
            ws.set_row(ridx, 82)
        elif max_len > 250:
            ws.set_row(ridx, 58)
        elif max_len > 120:
            ws.set_row(ridx, 38)
        else:
            ws.set_row(ridx, 22)
    if rows and autofilter:
        ws.autofilter(start_row, start_col, start_row + len(rows), start_col + len(headers) - 1)
        ws.freeze_panes(start_row + 1, 0)


def write_chart_data(ws: xlsxwriter.worksheet.Worksheet, row: int, col: int, left: str, right: str, rows: list[tuple[str, int]], formats: dict[str, Any]) -> None:
    write_table(ws, row, col, [left, right], [{left: name, right: count} for name, count in rows], formats, autofilter=False)


def chart_refs(sheet: str, start_row: int, start_col: int, count: int) -> tuple[str, str]:
    cat_col = xl_col_to_name(start_col)
    val_col = xl_col_to_name(start_col + 1)
    first = start_row + 2
    last = start_row + count + 1
    return f"='{sheet}'!${cat_col}${first}:${cat_col}${last}", f"='{sheet}'!${val_col}${first}:${val_col}${last}"


def add_bar_chart(workbook: xlsxwriter.Workbook, ws: xlsxwriter.worksheet.Worksheet, title: str, start_row: int, start_col: int, count: int, anchor: str, color: str) -> None:
    chart = workbook.add_chart({"type": "column"})
    categories, values = chart_refs(ws.get_name(), start_row, start_col, count)
    chart.add_series({"categories": categories, "values": values, "fill": {"color": color}, "border": {"color": color}})
    chart.set_title({"name": title})
    chart.set_legend({"none": True})
    chart.set_style(11)
    chart.set_plotarea({"border": {"color": "#DDDDDD"}, "fill": {"color": WHITE}})
    ws.insert_chart(anchor, chart, {"x_scale": 1.1, "y_scale": 1.15})


def add_pie_chart(workbook: xlsxwriter.Workbook, ws: xlsxwriter.worksheet.Worksheet, title: str, start_row: int, start_col: int, count: int, anchor: str) -> None:
    chart = workbook.add_chart({"type": "pie"})
    categories, values = chart_refs(ws.get_name(), start_row, start_col, count)
    chart.add_series({"categories": categories, "values": values})
    chart.set_title({"name": title})
    chart.set_style(10)
    ws.insert_chart(anchor, chart, {"x_scale": 1.0, "y_scale": 1.05})


def write_workbook(analysis: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    workbook = xlsxwriter.Workbook(OUTPUT_FILE)
    formats = fmt(workbook)
    generated = datetime.now().strftime("%m/%d/%Y, %I:%M:%S %p")
    rows = analysis["rows"]
    videos_represented = len(analysis["video_counts"])
    top_tool = analysis["tool_counts"].most_common(1)[0][0] if analysis["tool_counts"] else "-"
    reply_rows = analysis["reply_rows"]
    high_replies = sum(1 for row in reply_rows if row["priority"] == "High")

    dashboard = workbook.add_worksheet("Dashboard")
    setup_sheet(
        dashboard,
        "DataSense YouTube Comment Insights",
        f"{len(rows)} comments across recent DataSense videos. Generated {generated}.",
        formats,
        [20, 14, 18, 24, 14, 12, 18, 18, 18, 18, 18, 18],
    )
    dashboard.set_zoom(90)
    kpis = [
        ("Videos represented", videos_represented),
        ("Comments reviewed", len(rows)),
        ("High reply opportunities", high_replies),
        ("Top mentioned tool", top_tool),
        ("Skipped videos", 0),
    ]
    for idx, (label, value) in enumerate(kpis):
        row = 3 + idx
        dashboard.write(row, 0, label, formats["kpi_label"])
        dashboard.write(row, 1, value, formats["kpi_value"])

    top_categories = analysis["category_counts"].most_common(8)
    cat_rows = [{"Category": name, "Comments": count, "Share": count / max(len(rows), 1)} for name, count in top_categories]
    write_table(dashboard, 3, 3, ["Category", "Comments", "Share"], cat_rows, formats, {"Share"}, autofilter=False)
    top_tools = analysis["tool_counts"].most_common(8)
    write_table(dashboard, 14, 3, ["Tool", "Mentions"], [{"Tool": name, "Mentions": count} for name, count in top_tools], formats, autofilter=False)
    priority_counts = Counter(row["priority"] for row in reply_rows).most_common()
    write_table(dashboard, 14, 0, ["Priority", "Comments"], [{"Priority": k, "Comments": v} for k, v in priority_counts], formats, autofilter=False)
    dashboard.merge_range(9, 0, 12, 2, dashboard_takeaway(analysis), formats["note"])
    add_bar_chart(workbook, dashboard, "Comment Category Mix", 3, 3, len(cat_rows), "G3", TEAL)
    add_bar_chart(workbook, dashboard, "Top Tool Mentions", 14, 3, len(top_tools), "G18", TEAL)
    add_pie_chart(workbook, dashboard, "Reply Opportunity Priority", 14, 0, max(1, len(priority_counts)), "A20")

    creator = workbook.add_worksheet("Creator Insights")
    setup_sheet(creator, "Creator Insights", "Ranked comment patterns and recommended creator actions.", formats, [24, 9, 10, 42, 64, 54])
    write_table(creator, 4, 0, ["pattern", "count", "share", "affectedVideos", "representativeComments", "recommendedAction"], analysis["creator_rows"], formats, {"share"})

    questions = workbook.add_worksheet("Frequent Questions")
    setup_sheet(questions, "Frequent Questions", "Recurring questions grouped by viewer need.", formats, [24, 9, 19, 78, 58])
    write_table(questions, 4, 0, ["questionTheme", "count", "beginnerOrAdvanced", "exampleQuestions", "suggestedAnswerAngle"], analysis["question_rows"], formats)

    ideas = workbook.add_worksheet("Content Ideas")
    setup_sheet(ideas, "Content Ideas", "Video and community-post ideas backed by comment evidence.", formats, [40, 13, 52, 12, 78])
    write_table(ideas, 4, 0, ["idea", "evidenceCount", "suggestedTitleAngle", "priority", "sourceComments"], analysis["content_rows"], formats)

    replies = workbook.add_worksheet("Reply Opportunities")
    setup_sheet(replies, "Reply Opportunities", "Comments worth answering, pinning, or turning into creator actions.", formats, [12, 20, 72, 58, 34, 50])
    write_table(replies, 4, 0, ["priority", "author", "comment", "video", "reasonFlagged", "suggestedReplyAction"], reply_rows[:80], formats)

    raw = workbook.add_worksheet("Raw Comments")
    setup_sheet(raw, "Raw Comments", "Clean source rows used for this workbook.", formats, [50, 15, 22, 20, 24, 82, 9, 19, 18, 21, 15])
    raw_rows = [
        {
            "videoTitle": excerpt(row["videoTitle"], 90),
            "videoId": row["videoId"],
            "commentId": row["commentId"],
            "author": row["author"],
            "authorChannelId": row["authorChannelId"],
            "text": row["text"],
            "likes": row["likes"],
            "publishedAt": row["publishedAt"],
            "category": row["category"],
            "questionTheme": row["questionTheme"],
            "priority": row["priority"],
        }
        for row in rows
    ]
    write_table(raw, 4, 0, ["videoTitle", "videoId", "commentId", "author", "authorChannelId", "text", "likes", "publishedAt", "category", "questionTheme", "priority"], raw_rows, formats)

    workbook.close()


def dashboard_takeaway(analysis: dict[str, Any]) -> str:
    top_category, top_count = analysis["category_counts"].most_common(1)[0]
    top_question = analysis["question_rows"][0]["questionTheme"] if analysis["question_rows"] else "general questions"
    return (
        f'Primary pattern: "{top_category}" appears in {top_count} of the sampled comments. '
        f"The strongest next creator move is to turn recurring {top_question.lower()} signals "
        "into short replies, pinned comments, community posts, and practical follow-up videos."
    )


def main() -> None:
    env = load_env()
    missing = [key for key in ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] if not env.get(key)]
    if missing:
        raise SystemExit(f"Missing required env vars in .env.local: {', '.join(missing)}")
    comments = fetch_recent_comments(env)
    analysis = analyze(comments)
    write_workbook(analysis)
    print(
        json.dumps(
            {
                "output": str(OUTPUT_FILE),
                "comments_analyzed": len(analysis["rows"]),
                "videos_represented": len(analysis["video_counts"]),
                "top_categories": analysis["category_counts"].most_common(5),
                "reply_opportunities": len(analysis["reply_rows"]),
                "content_ideas": len(analysis["content_rows"]),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
