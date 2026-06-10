#!/usr/bin/env python3
import asyncio
import json
import sys

from playwright.async_api import async_playwright


def parse_cookie(cookie: str) -> list[dict]:
    cookies = []
    for item in (cookie or "").split(";"):
        if "=" not in item:
            continue
        name, value = item.strip().split("=", 1)
        if not name:
            continue
        cookies.append(
            {
                "name": name,
                "value": value,
                "domain": ".facebook.com",
                "path": "/",
            }
        )
    return cookies


async def first_visible(page, selectors: list[str]):
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            if await locator.is_visible(timeout=1500):
                return locator
        except Exception:
            continue
    return None


async def main():
    payload = json.loads(sys.stdin.read() or "{}")
    action = str(payload.get("action") or "send").lower()
    cookie = str(payload.get("cookie") or "")
    target = str(payload.get("target") or "").strip()
    text = str(payload.get("text") or "").strip()
    image_path = str(payload.get("image_path") or "").strip()
    image_paths = [str(item).strip() for item in payload.get("image_paths") or [] if str(item).strip()]
    file_url = str(payload.get("file_url") or "").strip()

    if not cookie:
        raise RuntimeError("Missing Facebook cookie")
    if not target:
        raise RuntimeError("Missing Facebook target")
    if action in {"send", "send_image", "send_images", "send_file"} and not any(
        [text, image_path, image_paths, file_url]
    ):
        raise RuntimeError("Missing Facebook text or media")

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
        await page.goto(f"https://www.facebook.com/messages/t/{target}", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)

        body_text = await page.locator("body").inner_text()
        if "login" in page.url.lower() or "Đăng nhập" in body_text or "Log in" in body_text:
            raise RuntimeError("Facebook cookie hết hạn hoặc chưa đăng nhập.")

        textbox = await first_visible(
            page,
            [
                'div[role="textbox"][contenteditable="true"]',
                'div[contenteditable="true"][data-lexical-editor="true"]',
            ],
        )
        if not textbox:
            raise RuntimeError("Không tìm thấy ô nhập Messenger.")

        files = image_paths or ([image_path] if image_path else [])
        if files:
            file_input = await first_visible(page, ['input[type="file"]'])
            if not file_input:
                raise RuntimeError("Không tìm thấy ô upload file Messenger.")
            await file_input.set_input_files(files)
            await page.wait_for_timeout(2500)

        if file_url:
            raise RuntimeError("Messenger web bridge hiện chưa hỗ trợ file URL từ xa.")

        if text:
            await textbox.fill(text)

        send_button = await first_visible(
            page,
            [
                'div[aria-label="Send"]',
                'button[aria-label="Send"]',
                'div[aria-label="Gửi"]',
                'button[aria-label="Gửi"]',
            ],
        )
        if send_button:
            await send_button.click()
        else:
            await textbox.press("Enter")

        await page.wait_for_timeout(1500)
        await browser.close()

    print(json.dumps({"ok": True, "target": target}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
