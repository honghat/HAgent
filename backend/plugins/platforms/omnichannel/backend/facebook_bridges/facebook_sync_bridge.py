#!/usr/bin/env python3
import asyncio
import json
import re
import sys

from playwright.async_api import async_playwright


def parse_cookie(cookie: str) -> list[dict]:
    cookies = []
    for item in (cookie or "").split(";"):
        if "=" not in item:
            continue
        name, value = item.strip().split("=", 1)
        if name:
            cookies.append({"name": name, "value": value, "domain": ".facebook.com", "path": "/"})
    return cookies


async def main():
    payload = json.loads(sys.stdin.read() or "{}")
    cookie = str(payload.get("cookie") or "")
    max_threads = int(payload.get("max_threads") or 30)
    if not cookie:
        raise RuntimeError("Missing Facebook cookie")

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1440, "height": 900},
        )
        await context.add_cookies(parse_cookie(cookie))
        page = await context.new_page()
        await page.goto("https://www.facebook.com/messages/", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3500)
        body_text = await page.locator("body").inner_text()
        if "login" in page.url.lower() or "Đăng nhập" in body_text or "Log in" in body_text:
            raise RuntimeError("Facebook cookie hết hạn hoặc chưa đăng nhập.")

        rows = await page.locator('a[href*="/messages/t/"], a[href*="/messages/e2ee/t/"]').evaluate_all(
            """(anchors, limit) => anchors.slice(0, limit).map(anchor => ({
                href: anchor.getAttribute('href') || '',
                text: (anchor.innerText || '').trim()
            }))""",
            max_threads,
        )
        await browser.close()

    seen = set()
    threads = []
    for row in rows:
        href = str(row.get("href") or "")
        match = re.search(r"/messages/(?:e2ee/)?t/([^/?#]+)", href)
        if not match:
            continue
        external_id = match.group(1)
        if external_id in seen:
            continue
        seen.add(external_id)
        text = str(row.get("text") or "").strip()
        title = next((line.strip() for line in text.splitlines() if line.strip()), external_id)
        threads.append({"external_id": external_id, "title": title})

    print(json.dumps({"ok": True, "threads": threads}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
