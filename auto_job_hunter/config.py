import os
from dotenv import load_dotenv

load_dotenv()

# Anthropic
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
CLAUDE_MODEL = "claude-3-5-sonnet-20241022"

# Telegram
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./jobs.db")

# Limits
MAX_APPLY_PER_DAY = int(os.getenv("MAX_APPLY_PER_DAY", "20"))
MAX_LLM_CALLS_PER_MINUTE = int(os.getenv("MAX_LLM_CALLS_PER_MINUTE", "10"))
MIN_MATCH_SCORE_TO_APPLY = float(os.getenv("MIN_MATCH_SCORE_TO_APPLY", "0.65"))

# User profile
USER_NAME = os.getenv("USER_NAME", "Nguyen Hong Hat")
USER_EMAIL = os.getenv("USER_EMAIL", "nguyenhonghat@gmail.com")
USER_SENIORITY = os.getenv("USER_SENIORITY", "mid")
