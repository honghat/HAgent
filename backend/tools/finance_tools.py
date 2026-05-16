import aiohttp
import asyncio
import re
from typing import Optional, Dict, Any
from .registry import registry

async def get_gold_price() -> str:
    """Fetch current gold prices from DOJI (giavang.doji.vn)."""
    url = "https://giavang.doji.vn/trangchu.html"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as response:
                if response.status != 200:
                    return f"Lỗi kết nối tới DOJI: {response.status}"
                html = await response.text()

        rows = []
        for tr_match in re.finditer(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL):
            cols = re.findall(r"<td[^>]*>(.*?)</td>", tr_match.group(1), re.DOTALL)
            if len(cols) >= 3:
                type_text = re.sub(r"<[^>]*>", "", cols[0]).strip()
                buy_text = re.sub(r"<[^>]*>", "", cols[1]).strip()
                sell_text = re.sub(r"<[^>]*>", "", cols[2]).strip()
                buy_clean = buy_text.replace(",", "")
                if type_text and buy_clean.replace(".", "").isdigit():
                    rows.append(f"- {type_text}: Mua {buy_text} | Bán {sell_text}")

        if not rows:
            fallback = re.search(r"Cập nhật.*?(\d[\d:/\s]+)", html)
            if fallback:
                return f"Không tìm thấy bảng giá. Trang DOJI có thể đã thay đổi cấu trúc. Cập nhật: {fallback.group(0)}"
            return "Không tìm thấy bảng giá trên DOJI."

        time_match = re.search(r"Cập nhật lúc:?\s*([^<]+)", html, re.I)
        time_str = time_match.group(1).strip() if time_match else "Vừa xong"

        return f"### GIÁ VÀNG DOJI (Nguồn: giavang.doji.vn)\nCập nhật: {time_str}\n\n" + "\n".join(rows)

    except Exception as e:
        return f"Lỗi khi lấy giá vàng từ DOJI: {str(e)}"

async def _handle_get_gold_price(args: Dict[str, Any], **kwargs) -> str:
    return await get_gold_price()

registry.register(
    name="get_gold_price",
    toolset="finance",
    schema={
        "name": "get_gold_price",
        "description": "Lay gia vang hom nay tu DOJI (giavang.doji.vn). Dung khi hoi gia vang, gia vang SJC, vang mieng, vang nhan.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    handler=_handle_get_gold_price,
    is_async=True,
    emoji="💰",
)

# ── Silver Price ──────────────────────────────────────────────────────────

async def _handle_get_silver_price(args: Dict[str, Any], **kwargs) -> str:
    urls = [
        ("BAC DOJI 99.9 - 1 LUONG", "https://giabac.doji.vn/data/DataBac9991Luong.txt"),
        ("BAC DOJI 99.9 - 1 KG", "https://giabac.doji.vn/data/DataBac9991Kg.txt"),
    ]
    results = []
    update_time = ""
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    try:
        async with aiohttp.ClientSession(headers=headers) as s:
            for name, url in urls:
                async with s.get(url + "?t=" + str(asyncio.get_event_loop().time()),
                                 timeout=aiohttp.ClientTimeout(total=10)) as r:
                    if r.status == 200:
                        text = await r.text()
                        lines = text.strip().split("\n")
                        if lines:
                            parts = lines[-1].split("|")
                            if len(parts) >= 3:
                                buy, sell, t = parts[0], parts[1], parts[2]
                                def fmt(v):
                                    try:
                                        return f"{int(float(v)):,}".replace(",", ".")
                                    except:
                                        return v
                                results.append(f"- {name}: Mua {fmt(buy)} | Ban {fmt(sell)}")
                                update_time = t.strip() or update_time
                                if "1 LUONG" in name:
                                    try:
                                        x5 = int(float(buy)) * 5
                                        results.append(f"- BAC DOJI 99.9 - 5 LUONG: Mua {fmt(str(x5))} | Ban {fmt(str(int(float(sell))*5))}")
                                    except:
                                        pass
        if not results:
            return "Khong the lay du lieu gia bac tu DOJI."
        update = f"\nCap nhat: {update_time}" if update_time else ""
        return f"### GIA BAC DOJI (Nguon: giabac.doji.vn){update}\n\n" + "\n".join(results)
    except Exception as e:
        return f"Loi khi lay gia bac: {e}"


# ── Vietcombank Exchange Rate ─────────────────────────────────────────────

async def _handle_vietcombank_rate(args: Dict[str, Any], **kwargs) -> str:
    from datetime import date
    today = date.today()
    url = f"https://vietcombank.com.vn/api/exchangerates?date={today.year}-{today.month}-{today.day}"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        async with aiohttp.ClientSession(headers=headers) as s:
            async with s.get(url, timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status != 200:
                    return "Khong the lay ty gia Vietcombank."
                data = await r.json()
        items = data.get("Data") or []
        if not items:
            return "Khong co du lieu ty gia."
        updated = ""
        if data.get("UpdatedDate"):
            updated = f" ({data['UpdatedDate']})"
        lines = []
        for item in items:
            def fmt(v):
                try:
                    fv = float(v)
                    return f"{fv:,.0f}".replace(",", ".") if fv > 0 else "-"
                except:
                    return "-"
            cash = fmt(item.get("cash", 0))
            transfer = fmt(item.get("transfer", 0))
            sell = fmt(item.get("sell", 0))
            lines.append(f"- **{item.get('currencyCode', '')}** ({item.get('currencyName', '')}): "
                        f"Mua TM {cash} | CK {transfer} | Ban {sell}")
        return f"## Ty gia Vietcombank{updated}\n\n" + "\n".join(lines)
    except Exception as e:
        return f"Khong the lay ty gia Vietcombank: {e}"


# ── Currency Conversion ──────────────────────────────────────────────────

async def _handle_currency_convert(args: Dict[str, Any], **kwargs) -> str:
    amount = args.get("amount", 1)
    from_c = (args.get("from", "USD") or "").upper()
    to_c = (args.get("to", "VND") or "").upper()
    try:
        async with aiohttp.ClientSession() as s:
            url = f"https://api.exchangerate-api.com/v4/latest/{from_c}"
            async with s.get(url, timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status != 200:
                    return "Khong the lay ty gia."
                data = await r.json()
        rate = data.get("rates", {}).get(to_c)
        if not rate:
            return f"Khong tim thay ty gia {from_c} -> {to_c}."
        result = float(amount) * rate
        def fmt(v):
            if v >= 1000:
                return f"{v:,.2f}".replace(",", ".")
            return f"{v:.2f}"
        return f"{fmt(float(amount))} {from_c} = {fmt(result)} {to_c}"
    except Exception as e:
        return f"Loi chuyen doi: {e}"


# Register new tools
registry.register(
    name="get_silver_price",
    toolset="finance",
    schema={
        "name": "get_silver_price",
        "description": "Lay gia bac hom nay tu DOJI. Dung khi hoi gia bac, bac hom nay.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    handler=_handle_get_silver_price,
    is_async=True,
    emoji="🥈",
)

registry.register(
    name="vietcombank_rate",
    toolset="finance",
    schema={
        "name": "vietcombank_rate",
        "description": "Lay ty gia ngoai te Vietcombank moi nhat (USD, EUR, JPY, GBP, etc.).",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    handler=_handle_vietcombank_rate,
    is_async=True,
    emoji="💱",
)

registry.register(
    name="currency_convert",
    toolset="finance",
    schema={
        "name": "currency_convert",
        "description": "Quy doi tien te giua cac nuoc (VD: USD -> VND, EUR -> USD).",
        "parameters": {
            "type": "object",
            "properties": {
                "amount": {"type": "number", "description": "So tien can doi"},
                "from": {"type": "string", "description": "Ma tien te goc (USD, EUR, VND...)"},
                "to": {"type": "string", "description": "Ma tien te dich"},
            },
            "required": ["amount", "from", "to"],
        },
    },
    handler=_handle_currency_convert,
    is_async=True,
    emoji="💱",
)
