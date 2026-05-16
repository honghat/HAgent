"""Cấu hình Telegram API"""
TELEGRAM_BOT_TOKEN = "YOUR_BOT_TOKEN_HERE"  # ✅ Thêm token ở đây!
TELEGRAM_CHAT_ID = "-1001672928436"  # Chat ID của anh Hạt

def send_telegram(message):
    """Gửi tin qua Telegram API"""
    import requests
    url = "https://api.telegram.org/bot{}/sendTextMessage".format(TELEGRAM_BOT_TOKEN)
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message.strip(),
        "parse_mode": "HTML"
    }
    response = requests.post(url, json=payload)
    return response.json()
