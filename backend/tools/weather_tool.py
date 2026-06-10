"""Weather tool ported from JS: Open-Meteo API."""

from typing import Dict, Any
from datetime import datetime
import aiohttp
from .registry import registry

WEATHER_CODES = {
    0: "Troi quang", 1: "It may", 2: "Nhieu may", 3: "U am",
    45: "Suong mu", 48: "Suong mu dong bang",
    51: "Mua phun nhe", 53: "Mua phun", 55: "Mua phun nang hat",
    61: "Mua nhe", 63: "Mua vua", 65: "Mua nang hat",
    80: "Mua rao nhe", 81: "Mua rao vua", 82: "Mua rao nang hat",
    95: "Giong bao", 96: "Giong bao kem mua da", 99: "Giong bao manh kem mua da",
}


async def _handle_get_weather(args: Dict[str, Any], **kwargs) -> str:
    location = args.get("location", "Ho Chi Minh")
    try:
        async with aiohttp.ClientSession() as s:
            geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=3&language=vi&format=json"
            async with s.get(geo_url, timeout=aiohttp.ClientTimeout(total=8)) as r:
                if r.status != 200:
                    return "Khong the tim vi tri."
                geo = await r.json()

            first = (geo.get("results") or [None])[0]
            if not first:
                return f"Khong tim thay dia diem: {location}"

            w_url = (
                f"https://api.open-meteo.com/v1/forecast"
                f"?latitude={first['latitude']}&longitude={first['longitude']}"
                f"&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"
                f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto"
            )
            async with s.get(w_url, timeout=aiohttp.ClientTimeout(total=8)) as r:
                if r.status != 200:
                    return "Khong the lay thoi tiet."
                w = await r.json()

            name = ", ".join(filter(None, [first.get("name"), first.get("admin1"), first.get("country")]))
            cur = w.get("current", {})
            daily = w.get("daily", {})
            timezone_name = w.get("timezone") or "local"
            current_time = cur.get("time")
            current_time_text = "Khong ro"
            if isinstance(current_time, str) and current_time:
                try:
                    current_time_text = datetime.fromisoformat(current_time).strftime("%H:%M %d/%m/%Y")
                except ValueError:
                    current_time_text = current_time
            code = cur.get("weather_code", 0)
            condition = WEATHER_CODES.get(code, f"Ma {code}")

            return (
                f"Thoi tiet tai **{name}**:\n"
                f"- Cap nhat luc: {current_time_text} ({timezone_name})\n"
                f"- Nhiet do: {cur.get('temperature_2m', '?')}°C (cam giac: {cur.get('apparent_temperature', '?')}°C)\n"
                f"- Do am: {cur.get('relative_humidity_2m', '?')}%\n"
                f"- Gio: {cur.get('wind_speed_10m', '?')} km/h\n"
                f"- {condition}\n"
                f"- Cao nhat: {daily.get('temperature_2m_max', ['?'])[0]}°C, "
                f"Thap nhat: {daily.get('temperature_2m_min', ['?'])[0]}°C\n"
                f"- Luong mua: {daily.get('precipitation_sum', ['?'])[0]} mm"
            )
    except Exception:
        return "Khong the lay thong tin thoi tiet."


registry.register(
    name="get_weather",
    toolset="weather",
    schema={
        "name": "get_weather",
        "description": "Xem du bao thoi tiet cho mot dia diem. Su dung Open-Meteo API.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "Ten dia diem (thanh pho, tinh), VD: Ha Noi, Ho Chi Minh, Da Nang"}
            },
            "required": [],
        },
    },
    handler=_handle_get_weather,
    is_async=True,
    emoji="🌤",
)
