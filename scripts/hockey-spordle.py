#!/usr/bin/env python3
"""LE-RADAR — sidecar Spordle hockey (Python).

GitHub Actions Node + urllib se font servir un challenge Cloudflare.
Ce script tente, dans l'ordre :
  1. Worker Cloudflare (HOCKEY_CACHE_URL) — IP edge
  2. curl_cffi impersonate Chrome
  3. urllib stdlib

Sortie JSON stdout : {ok, via, site, matches}|{ok:false, error}
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request

SITES = {
    "collegial": "https://collegial.rseqhockey.com/fr",
    "universitaire": "https://universitaire.rseqhockey.com/fr",
}

DEFAULT_WORKER = os.environ.get(
    "HOCKEY_CACHE_URL",
    "https://le-radar-hockey.azdak.workers.dev",
).rstrip("/")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)


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


def fetch_urllib(url: str) -> tuple[int, str]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept-Language": "fr-CA,fr;q=0.9"},
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.status, resp.read().decode("utf-8", "replace")


def fetch_worker(site: str) -> tuple[str, str] | None:
    url = f"{DEFAULT_WORKER}/v1/html?site={site}"
    try:
        status, body = fetch_urllib(url)
    except Exception:
        return None
    if status != 200 or not body:
        return None
    if body.lstrip().startswith("{"):
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return None
        html = payload.get("html") or ""
        if html and not is_challenge(html) and "__NEXT_DATA__" in html:
            return html, "worker"
        return None
    if "__NEXT_DATA__" in body and not is_challenge(body):
        return body, "worker"
    return None


def fetch_curl_cffi(url: str) -> tuple[str, str] | None:
    try:
        from curl_cffi import requests as cf
    except ImportError:
        return None
    try:
        r = cf.get(
            url,
            impersonate="chrome",
            timeout=25,
            headers={"Accept-Language": "fr-CA,fr;q=0.9,en;q=0.8"},
        )
    except Exception:
        return None
    html = r.text or ""
    if r.status_code == 200 and "__NEXT_DATA__" in html and not is_challenge(html):
        return html, "curl_cffi"
    return None


def fetch_site(site: str) -> dict:
    origin = SITES[site]
    got = fetch_worker(site)
    if not got:
        got = fetch_curl_cffi(origin)
    if not got:
        try:
            status, html = fetch_urllib(origin)
            if status == 200 and "__NEXT_DATA__" in html and not is_challenge(html):
                got = html, "urllib"
        except Exception as exc:
            return {"ok": False, "site": site, "error": str(exc)}
    if not got:
        return {
            "ok": False,
            "site": site,
            "error": "cloudflare_challenge",
        }
    html, via = got
    matches = extract_matches(html)
    if matches is None:
        return {"ok": False, "site": site, "via": via, "error": "no_next_data"}
    return {
        "ok": True,
        "site": site,
        "via": via,
        "url": origin,
        "matchCount": len(matches),
        "matches": matches,
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
