#!/usr/bin/env python3
"""LE-RADAR — Spordle parser retained for fixtures.

Live collection is suspended after explicit HTTP 403 refusals. Official
institutional calendars are collected independently in campus-hockey-lib.js.
No edge proxy, browser impersonation or alternate network is attempted.
"""
from __future__ import annotations

import json
import re
import sys

SITES = {
    "collegial": "https://collegial.rseqhockey.com/fr",
    "universitaire": "https://universitaire.rseqhockey.com/fr",
}

def is_challenge(html: str) -> bool:
    if not html:
        return False
    if "<rss" in html[:800] or "__NEXT_DATA__" in html:
        return False
    low = html.lower()
    return (
        "just a moment" in low
        or "<title>un instant" in low
        or "challenges.cloudflare.com" in low
        or "cdn-cgi/challenge" in low
    )


def extract_matches(html: str):
    m = re.search(
        r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',
        html,
        re.S,
    )
    if not m:
        return None
    data = json.loads(m.group(1))
    games = (
        (data.get("props") or {}).get("pageProps") or {}
    ).get("scoreboardMatches")
    return games if isinstance(games, list) else None


def fetch_site(site: str) -> dict:
    return {
        "ok": False,
        "site": site,
        "error": "access_refused_http_403",
        "url": SITES[site],
    }


def main(argv: list[str]) -> int:
    if "--selftest" in argv:
        sample = '<html><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"scoreboardMatches":[{"id":1}]}}}</script></html>'
        got = extract_matches(sample)
        assert got == [{"id": 1}], got
        assert is_challenge("<title>Just a moment...</title>")
        assert not is_challenge(sample)
        print("OK hockey-spordle selftest")
        return 0
    site = "universitaire"
    if "--sector" in argv:
        i = argv.index("--sector")
        site = argv[i + 1] if i + 1 < len(argv) else site
    if site not in SITES:
        print(json.dumps({"ok": False, "error": f"unknown_site:{site}"}))
        return 2
    result = fetch_site(site)
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
