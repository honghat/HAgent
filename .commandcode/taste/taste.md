# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# python
- Port telegram.js functionality to Python (do not keep as a standalone JS service when migrating to FastAPI backend). Confidence: 0.70

# architecture
- The Python agent must be the central/core of all frontend functionality; the frontend (React/Vite) is only a display layer for agent results. Confidence: 0.95

# python
- When a Node.js tool/service file has been ported to Python, remove the original JS file (create a shim if needed for imports). Confidence: 0.65

# javascript
- Use the JS implementation as the standard/reference when both JS and Python implementations exist for the same functionality. Confidence: 0.70

# finance
- Use DOJI (giavang.doji.vn) as the gold price data source, not DanTri. Confidence: 0.75

# telegram
- Format ALL Telegram bot responses with rich/beautiful formatting (emoji, structured layout, not just plain text) — applies to all features, not just specific commands. Confidence: 0.80

# llm
- Use LM Studio (remote mode) as the LLM provider. Confidence: 0.65
- Hardcode tool-use enforcement for all models — remove conditional/auto-detection logic entirely, not just config. Keep tool calling simple and straightforward, no over-engineering. Confidence: 0.90
- For /terminal command: Use 9Router (cx) model provider. Confidence: 0.70

