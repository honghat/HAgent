# Example: Stirling-PDF (Web Search Only Path)

## Context
Researched Stirling-Tools/Stirling-PDF without any browser tools — only `web_search` (DuckDuckGo) was used.

## Queries Used
1. `"Stirling-PDF GitHub stars features overview"` — got description, license, base info
2. `"Stirling-PDF features list split merge OCR convert compress PDF tools"` — got detailed feature categories
3. `"Stirling-PDF 70+ tools categories split convert security OCR API automation"` — got more depth

## Result
Wiki entry: "Stirling-PDF - Self-hosted PDF Tool Suite" (under topics: github, self-hosted, pdf, tools, docker)

## What Worked
- Multiple targeted queries returned different snippets → combined for full picture
- DeepWiki.com appeared in search results → gave structured feature categories (70+ tools)
- Docker Hub result gave exact run command
- `save_wiki()` accepted the call with title, summary, topics, content

## Things to Note
- No browser tools needed for well-documented GitHub repos with active SEO
- `web_extract` failed with SearXNG-only setup (SearXNG is search-only)
- The `save_wiki` tool name still works despite possibly being deprecated
