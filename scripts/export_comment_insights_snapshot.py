import json
import os
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
workbook_override = os.environ.get("COMMENT_INSIGHTS_WORKBOOK")
WORKBOOK = (ROOT / workbook_override).resolve() if workbook_override else ROOT / "output" / "datasense-youtube-comment-insights.xlsx"
OUT = ROOT / "data" / "comment-insights.json"
YOUTUBE_STORE = ROOT / "data" / "youtube-store.json"

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

EXPECTED_SHEETS = {
    "Dashboard",
    "Creator Insights",
    "Frequent Questions",
    "Content Ideas",
    "Reply Opportunities",
    "Raw Comments",
}


def column_index(cell_ref: str) -> int:
    letters = re.match(r"([A-Z]+)", cell_ref).group(1)
    index = 0
    for letter in letters:
        index = index * 26 + ord(letter) - 64
    return index - 1


def as_number(value):
    if value is None or value == "":
        return 0
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return value
    return int(parsed) if parsed.is_integer() else parsed


def as_share(value):
    parsed = as_number(value)
    return parsed if isinstance(parsed, (int, float)) else 0


def split_pipe(value):
    if not value:
        return []
    return [part.strip() for part in str(value).split("|") if part.strip()]


def split_lines(value):
    if not value:
        return []
    return [part.strip() for part in str(value).splitlines() if part.strip()]


def read_workbook(path: Path):
    if not path.exists():
        raise SystemExit(f"Workbook not found: {path}")

    with zipfile.ZipFile(path) as archive:
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("main:si", NS):
                shared_strings.append("".join(text.text or "" for text in item.findall(".//main:t", NS)))

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}

        return {
            sheet.attrib["name"]: parse_sheet_rows(archive, rel_map, shared_strings, sheet)
            for sheet in workbook.findall("main:sheets/main:sheet", NS)
        }


def parse_sheet_rows(archive, rel_map, shared_strings, sheet):
    rel_id = sheet.attrib[f"{{{NS['rel']}}}id"]
    target = rel_map[rel_id].lstrip("/")
    sheet_path = target if target.startswith("xl/") else f"xl/{target}"
    root = ET.fromstring(archive.read(sheet_path))
    rows = []
    for row in root.findall("main:sheetData/main:row", NS):
        values = []
        for cell in row.findall("main:c", NS):
            index = column_index(cell.attrib["r"])
            while len(values) <= index:
                values.append(None)

            raw_value = None
            value_node = cell.find("main:v", NS)
            inline_node = cell.find("main:is/main:t", NS)
            if value_node is not None:
                raw_value = value_node.text
                if cell.attrib.get("t") == "s" and raw_value is not None:
                    raw_value = shared_strings[int(raw_value)]
            elif inline_node is not None:
                raw_value = inline_node.text

            values[index] = raw_value
        rows.append(values)
    return rows


def require_sheets(sheets):
    missing = sorted(EXPECTED_SHEETS - set(sheets))
    if missing:
        raise SystemExit(f"Workbook missing expected sheet(s): {', '.join(missing)}")


def table_from_sheet(rows, header_row_index=2):
    headers = [str(header).strip() if header else "" for header in rows[header_row_index]]
    records = []
    for row in rows[header_row_index + 1 :]:
        record = {}
        for index, header in enumerate(headers):
            if header:
                record[header] = row[index] if index < len(row) else None
        if any(value not in (None, "") for value in record.values()):
            records.append(record)
    return records


def parse_dashboard(rows):
    metric_rows = rows[2:6]
    metrics = {str(row[0]): row[1] for row in metric_rows if len(row) > 1 and row[0]}

    category_mix = []
    for row in rows[3:12]:
        if len(row) > 5 and row[3]:
            category_mix.append({"name": row[3], "count": as_number(row[4]), "share": as_share(row[5])})

    priority_mix = []
    top_tools = []
    for row in rows:
        if len(row) > 1 and row[0] in {"High", "Medium", "Low"}:
            priority_mix.append({"name": row[0], "count": as_number(row[1])})
        if len(row) > 4 and row[3] not in (None, "", "Tool", "Category"):
            value = as_number(row[4])
            if isinstance(value, (int, float)):
                top_tools.append({"name": row[3], "count": value})

    category_names = {item["name"] for item in category_mix}
    top_tools = [item for item in top_tools if item["name"] not in category_names]

    return {
        "title": rows[0][0],
        "subtitle": rows[1][0],
        "metrics": {
            "videosRepresented": as_number(metrics.get("Videos represented")),
            "commentsReviewed": as_number(metrics.get("Comments reviewed")),
            "highReplyOpportunities": as_number(metrics.get("High reply opportunities")),
            "topMentionedTool": metrics.get("Top mentioned tool") or "",
            "skippedVideos": as_number(metrics.get("Skipped videos")),
        },
        "primaryPattern": rows[8][0] if len(rows) > 8 and rows[8] else "",
        "categoryMix": category_mix,
        "priorityMix": priority_mix,
        "topTools": top_tools,
    }


def export_snapshot():
    sheets = read_workbook(WORKBOOK)
    require_sheets(sheets)
    brand = {"name": "DataSense", "channelUrl": "https://www.youtube.com/@Senseofdata", "iconUrl": "/datasense-brand-icon.jpg"}
    channel_stats = {}
    channel_profile = {}
    sync_status = {}
    if YOUTUBE_STORE.exists():
        store = json.loads(YOUTUBE_STORE.read_text(encoding="utf-8"))
        channel = store.get("channel") or {}
        brand["name"] = channel.get("title") or brand["name"]
        channel_stats = {
            "videosUploaded": as_number(channel.get("videoCount")),
            "commentsStored": len(store.get("comments") or {}),
            "totalChannelViews": as_number(channel.get("viewCount")),
            "subscribers": as_number(channel.get("subscriberCount")) if not channel.get("hiddenSubscriberCount") else "Hidden",
        }
        channel_profile = {
            "title": channel.get("title") or "DataSense",
            "description": channel.get("description") or "",
            "thumbnailUrl": brand["iconUrl"],
            "accessMode": channel.get("accessMode") or "public_only",
        }
        last_sync = store.get("lastSync") or {}
        sync_status = {
            "currentMode": last_sync.get("accessMode") or channel.get("accessMode") or "public_only",
            "oauthConnected": bool((store.get("oauth") or {}).get("refreshToken")),
            "lastSyncFinishedAt": last_sync.get("finishedAt") or "",
            "videosSeen": as_number(last_sync.get("videosSeen")),
            "commentsSeen": as_number(last_sync.get("commentsSeen")),
            "warnings": len(last_sync.get("warnings") or []),
        }

    creator_insights = [
        {
            "pattern": row.get("pattern") or "",
            "count": as_number(row.get("count")),
            "share": as_share(row.get("share")),
            "affectedVideos": split_lines(row.get("affectedVideos")),
            "representativeComments": split_pipe(row.get("representativeComments")),
            "recommendedAction": row.get("recommendedAction") or "",
        }
        for row in table_from_sheet(sheets["Creator Insights"])
    ]

    frequent_questions = [
        {
            "questionTheme": row.get("questionTheme") or "",
            "count": as_number(row.get("count")),
            "beginnerOrAdvanced": row.get("beginnerOrAdvanced") or "",
            "exampleQuestions": split_pipe(row.get("exampleQuestions")),
            "suggestedAnswerAngle": row.get("suggestedAnswerAngle") or "",
        }
        for row in table_from_sheet(sheets["Frequent Questions"])
    ]

    content_ideas = [
        {
            "idea": row.get("idea") or "",
            "evidenceCount": as_number(row.get("evidenceCount")),
            "suggestedTitleAngle": row.get("suggestedTitleAngle") or "",
            "priority": row.get("priority") or "",
            "sourceComments": split_pipe(row.get("sourceComments")),
        }
        for row in table_from_sheet(sheets["Content Ideas"])
    ]

    reply_opportunities = [
        {
            "priority": row.get("priority") or "",
            "author": row.get("author") or "",
            "comment": row.get("comment") or "",
            "video": row.get("video") or "",
            "reasonFlagged": row.get("reasonFlagged") or "",
            "suggestedReplyAction": row.get("suggestedReplyAction") or "",
        }
        for row in table_from_sheet(sheets["Reply Opportunities"])
    ]

    raw_comments = [
        {
            "videoTitle": row.get("videoTitle") or "",
            "videoId": row.get("videoId") or "",
            "commentId": row.get("commentId") or "",
            "author": row.get("author") or "",
            "authorChannelId": row.get("authorChannelId") or "",
            "text": row.get("text") or "",
            "likes": as_number(row.get("likes")),
            "publishedAt": row.get("publishedAt") or "",
            "category": row.get("category") or "",
            "questionTheme": row.get("questionTheme") or "",
            "priority": row.get("priority") or "",
        }
        for row in table_from_sheet(sheets["Raw Comments"])
    ]

    dashboard = parse_dashboard(sheets["Dashboard"])
    if channel_stats:
        channel_stats["commentsStored"] = max(
            as_number(channel_stats.get("commentsStored")),
            as_number(dashboard["metrics"].get("commentsReviewed")),
        )

    snapshot = {
        "brand": brand,
        "channelStats": channel_stats,
        "channelProfile": channel_profile,
        "syncStatus": sync_status,
        "source": {
            "workbook": str(WORKBOOK.relative_to(ROOT)).replace("\\", "/"),
            "generatedBy": "scripts/export_comment_insights_snapshot.py",
        },
        "dashboard": dashboard,
        "creatorInsights": creator_insights,
        "frequentQuestions": frequent_questions,
        "contentIdeas": content_ideas,
        "replyOpportunities": reply_opportunities,
        "rawComments": raw_comments,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}")
    print(
        f"{len(raw_comments)} raw comments, {len(reply_opportunities)} reply opportunities, "
        f"{len(content_ideas)} content ideas"
    )


if __name__ == "__main__":
    export_snapshot()
