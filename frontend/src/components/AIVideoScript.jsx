import { useState } from 'react'

const SAMPLE_PROMPTS = [
  'Viết kịch bản video 60s giải thích vì sao trứng có 2 lòng đỏ, giọng hài hước, cuốn hút',
  'Kịch bản TikTok 30s về cách tiết kiệm tiền hiệu quả, phong cách kể chuyện',
  'Script YouTube Shorts 45s: lợi ích của việc đọc sách mỗi ngày',
]

// ── khớp backend/config.yaml ───────────────────────────
const PROVIDER = 'pekpik-custom'
const MODEL = 'deepseek-chat'

export default function AIVideoScript() {
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleGenerate() {
    if (!prompt.trim()) return
    setLoading(true)
    setResult('')

    try {
      const res = await fetch('/api/hagent-ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: PROVIDER,
          model: MODEL,
          messages: [
            { role: 'system', content: 'Bạn là chuyên gia viết kịch bản video ngắn (30-60s). Kịch bản cần có: Hook 3s đầu, nội dung chính ngắn gọn, CTA cuối. Viết bằng tiếng Việt, giọng tự nhiên.' },
            { role: 'user', content: prompt },
          ],
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setResult('❌ Lỗi: ' + (errData.detail || `HTTP ${res.status}`))
        return
      }
      const data = await res.json()
      setResult(data.choices?.[0]?.message?.content || 'Không có phản hồi')
    } catch (e) {
      setResult('❌ Lỗi kết nối: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 overflow-auto p-4">
      <div className="shrink-0">
        <h2 className="text-lg font-bold text-gray-800">🤖 AI Sinh Kịch bản</h2>
        <p className="text-xs text-gray-500">Nhập ý tưởng, AI sẽ viết kịch bản video ngắn cho bạn</p>
      </div>

      {/* Prompt mẫu */}
      <div className="shrink-0 flex flex-wrap gap-1.5">
        {SAMPLE_PROMPTS.map((sp, i) => (
          <button
            key={i}
            onClick={() => setPrompt(sp)}
            className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] text-blue-600 hover:bg-blue-100 transition-colors"
          >
            {sp.slice(0, 50)}…
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="shrink-0 flex gap-2">
        <input
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Nhập ý tưởng video của bạn..."
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
        />
        <button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-blue-700 transition-colors"
        >
          {loading ? '🔄 Đang viết...' : '🚀 Tạo'}
        </button>
      </div>

      {/* Kết quả */}
      {result && (
        <div className="flex-1 overflow-auto rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400">📜 KỊCH BẢN</span>
            <button
              onClick={() => navigator.clipboard.writeText(result)}
              className="ml-auto rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-200"
            >
              📋 Copy
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 font-sans">
            {result}
          </pre>
        </div>
      )}
    </div>
  )
}
