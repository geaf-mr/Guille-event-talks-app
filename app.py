import re
import html
import time
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from bs4 import BeautifulSoup
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_DURATION_SEC = 300  # 5 minutes default cache

cache = {
    "data": None,
    "last_fetched": 0
}

def clean_text(text: str) -> str:
    """Normalize whitespace and strip HTML entities."""
    if not text:
        return ""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def build_tweet_draft(date_str: str, category: str, text: str, link: str) -> str:
    """
    Constructs an engaging tweet draft within Twitter's 280-character limit.
    Twitter reserves 23 characters for URLs.
    """
    cat_tag = category.upper() if category else "UPDATE"
    header = f"🚀 BigQuery [{cat_tag}] ({date_str}):\n"
    footer = f"\n\n🔗 {link}\n#BigQuery #GoogleCloud #DataEngineering"
    
    # Calculate available characters for text
    # Twitter URL counts as 23 chars, but in raw text it might be longer/shorter
    # Safe estimate: keep total string under ~260 chars
    max_text_len = 160
    
    # Get first sentence or snippet
    snippet = clean_text(text)
    if len(snippet) > max_text_len:
        snippet = snippet[:max_text_len - 3].rstrip() + "..."
    
    draft = f"{header}{snippet}{footer}"
    return draft

def parse_release_feed(xml_content: bytes):
    """
    Parses Atom XML feed and decomposes entries into discrete update cards.
    """
    root = ET.fromstring(xml_content)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    
    feed_title = root.findtext("atom:title", namespaces=ns) or "BigQuery Release Notes"
    feed_updated = root.findtext("atom:updated", namespaces=ns) or ""
    
    entries = root.findall("atom:entry", namespaces=ns)
    all_updates = []
    category_counts = {}
    
    for entry_idx, entry in enumerate(entries):
        entry_title = clean_text(entry.findtext("atom:title", namespaces=ns) or "Release Note")
        entry_id = clean_text(entry.findtext("atom:id", namespaces=ns) or f"entry-{entry_idx}")
        entry_updated = clean_text(entry.findtext("atom:updated", namespaces=ns) or "")
        
        link_el = entry.find("atom:link", ns)
        entry_link = link_el.attrib.get("href", "") if link_el is not None else "https://docs.cloud.google.com/bigquery/docs/release-notes"
        
        raw_content = entry.findtext("atom:content", namespaces=ns) or ""
        soup = BeautifulSoup(raw_content, "html.parser")
        
        # Ensure all links open in a new tab safely
        for a_tag in soup.find_all("a"):
            a_tag["target"] = "_blank"
            a_tag["rel"] = "noopener noreferrer"
        
        h3_tags = soup.find_all("h3")
        
        if h3_tags:
            for sub_idx, h3 in enumerate(h3_tags):
                cat_name = clean_text(h3.get_text()) or "Feature"
                category_counts[cat_name] = category_counts.get(cat_name, 0) + 1
                
                # Gather siblings until next h3
                chunk_parts = []
                curr = h3.next_sibling
                while curr and curr.name != "h3":
                    chunk_parts.append(str(curr))
                    curr = curr.next_sibling
                
                chunk_html = "".join(chunk_parts).strip()
                chunk_soup = BeautifulSoup(chunk_html, "html.parser")
                plain_desc = clean_text(chunk_soup.get_text())
                
                # If chunk is empty, use heading itself
                if not plain_desc:
                    plain_desc = cat_name
                
                tweet_draft = build_tweet_draft(entry_title, cat_name, plain_desc, entry_link)
                
                unique_id = f"upd-{entry_idx}-{sub_idx}"
                all_updates.append({
                    "id": unique_id,
                    "date": entry_title,
                    "updated_iso": entry_updated,
                    "category": cat_name,
                    "content_html": chunk_html,
                    "plain_text": plain_desc,
                    "link": entry_link,
                    "tweet_draft": tweet_draft
                })
        else:
            # Fallback if no h3 found
            plain_desc = clean_text(soup.get_text())
            cat_name = "Update"
            category_counts[cat_name] = category_counts.get(cat_name, 0) + 1
            unique_id = f"upd-{entry_idx}-0"
            tweet_draft = build_tweet_draft(entry_title, cat_name, plain_desc, entry_link)
            
            all_updates.append({
                "id": unique_id,
                "date": entry_title,
                "updated_iso": entry_updated,
                "category": cat_name,
                "content_html": str(soup),
                "plain_text": plain_desc,
                "link": entry_link,
                "tweet_draft": tweet_draft
            })
            
    return {
        "title": feed_title,
        "feed_url": FEED_URL,
        "updated": feed_updated,
        "total_updates": len(all_updates),
        "total_entries": len(entries),
        "categories": sorted(list(category_counts.keys())),
        "category_counts": category_counts,
        "updates": all_updates
    }

def fetch_feed_data(force_refresh: bool = False):
    """
    Fetches the feed from Google docs with in-memory caching.
    """
    now = time.time()
    if not force_refresh and cache["data"] is not None and (now - cache["last_fetched"]) < CACHE_DURATION_SEC:
        cached_result = dict(cache["data"])
        cached_result["from_cache"] = True
        cached_result["cache_age_sec"] = int(now - cache["last_fetched"])
        return cached_result, None

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BigQueryReleaseNotesViewer/1.0"
    }
    
    try:
        response = requests.get(FEED_URL, headers=headers, timeout=12)
        response.raise_for_status()
        parsed = parse_release_feed(response.content)
        parsed["from_cache"] = False
        parsed["fetched_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        cache["data"] = parsed
        cache["last_fetched"] = now
        return parsed, None
    except Exception as e:
        # If fetch fails but we have cached data, return cached data with warning
        if cache["data"] is not None:
            fallback = dict(cache["data"])
            fallback["warning"] = f"Failed to refresh live feed ({str(e)}). Serving cached version."
            fallback["from_cache"] = True
            return fallback, None
        return None, str(e)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/notes")
def api_notes():
    force_refresh = request.args.get("refresh", "0") in ("1", "true", "True")
    data, error = fetch_feed_data(force_refresh=force_refresh)
    if error:
        return jsonify({"success": False, "error": error}), 502
    return jsonify({"success": True, "data": data})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
