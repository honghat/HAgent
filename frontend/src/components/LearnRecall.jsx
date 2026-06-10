import { useEffect, useState } from 'react'
import { Mic, Square, X, Sparkles, Send, Volume2, Loader2, CheckCircle2, AlertCircle, BookOpen } from 'lucide-react'
import { useSpeechToText } from '../hooks/useSpeechToText.js'
import {
  fetchLessonRecallQuestions,
  submitLessonRecall,
  submitEnglishRecall,
  submitEnglishShadow,
  parseGapNotes,
  strengthColor,
} from '../lib/recallApi.js'

const MODE_LABELS = {
  lesson: 'Tự giảng lại bài học',
  english: 'Tự giảng lại mục tiếng Anh',
  shadow: 'Shadowing (nói theo mẫu)',
}

export default function LearnRecall({
  token,
  provider,
  cxModel,
  mode = 'lesson', // 'lesson' | 'english' | 'shadow'
  item,           // { id, topic | title, content | expected, track?, type? }
  onClose,
  onCompleted,    // (updatedItem) => void
}) {
  const expected = (mode === 'shadow' ? (item?.expected || item?.content || '') : '').trim()
  const titleText = item?.topic || item?.title || '(không rõ)'
  const [questions, setQuestions] = useState([])
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [manualStrength, setManualStrength] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (mode === 'lesson') {
          const data = await fetchLessonRecallQuestions(token, item?.track)
          if (!cancelled) setQuestions(data.questions || [])
        } else {
          setQuestions([
            `Giải thích '${titleText}' bằng lời của bạn.`,
            'Cho một ví dụ sử dụng đúng.',
            mode === 'english' ? 'Dịch nghĩa sang tiếng Việt ngắn gọn.' : 'Nói lại câu mẫu (shadowing).',
          ])
        }
      } catch (e) {
        if (!cancelled) setError(`Không tải được câu hỏi: ${e.message}`)
      }
    }
    load()
    return () => { cancelled = true }
  }, [token, mode, item?.id])

  const sttLang = mode === 'lesson' ? 'vi' : 'en'
  const speechToText = useSpeechToText({
    token,
    language: sttLang,
    prompt: mode === 'shadow' ? expected : (mode === 'lesson' ? titleText : 'This is an English practice answer.'),
    onTranscript: (text) => {
      const next = String(text || '').trim()
      if (!next) return
      setTranscript(current => current.trim() ? `${current.trim()} ${next}` : next)
      setError('')
    },
    onError: (msg) => setError(msg || 'STT lỗi.'),
  })

  function speakExpected() {
    if (!expected || typeof window === 'undefined' || !window.speechSynthesis) return
    const utter = new SpeechSynthesisUtterance(expected)
    utter.lang = 'en-US'
    utter.rate = 0.95
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
  }

  async function submit() {
    if (!transcript.trim()) {
      setError('Bạn chưa nói/gõ gì. Hãy giảng lại trước.')
      return
    }
    setBusy('submit')
    setError('')
    try {
      const aiProvider = provider || ''
      const aiModel = provider === 'cx' ? cxModel : ''
      const payload = { id: item.id, transcript, provider: aiProvider, model: aiModel }
      if (manualStrength != null) payload.strength = manualStrength
      const data = mode === 'lesson'
        ? await submitLessonRecall(token, payload)
        : mode === 'english'
          ? await submitEnglishRecall(token, payload)
          : await submitEnglishShadow(token, { ...payload, expected })
      setResult(data)
      onCompleted?.(data)
    } catch (err) {
      setError(err.message || 'Gửi thất bại.')
    } finally {
      setBusy('')
    }
  }

  const evalData = result?.eval || {}
  const schedule = result?.schedule || {}
  const gap = parseGapNotes(item?.gapNotes)
  const colorClass = strengthColor(schedule.strength)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-black/[0.06] bg-gradient-to-r from-indigo-50 to-white px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="shrink-0 text-indigo-500" />
              <h2 className="truncate text-sm font-semibold text-gray-900">{MODE_LABELS[mode]}</h2>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-gray-500">{titleText}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {mode === 'shadow' && expected && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5">
              <BookOpen size={14} className="mt-0.5 shrink-0 text-indigo-500" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Câu mẫu</div>
                <div className="mt-1 text-sm font-medium leading-relaxed text-gray-900">{expected}</div>
              </div>
              <button
                onClick={speakExpected}
                className="shrink-0 rounded-md border border-indigo-200 bg-white p-1.5 text-indigo-600 hover:bg-indigo-50"
                title="Nghe AI đọc"
              >
                <Volume2 size={14} />
              </button>
            </div>
          )}

          {questions.length > 0 && (
            <div className="mb-3 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Câu hỏi gợi mở</div>
              <ul className="space-y-1 rounded-lg border border-black/[0.06] bg-gray-50/60 p-2.5 text-[12px] leading-relaxed text-gray-700">
                {questions.map((q, idx) => (
                  <li key={idx} className="flex gap-1.5">
                    <span className="text-gray-400">{idx + 1}.</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={speechToText.toggle}
              disabled={speechToText.transcribing}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition ${
                speechToText.recording
                  ? 'border border-rose-300 bg-rose-50 text-rose-700 animate-pulse'
                  : 'border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              {speechToText.recording ? <Square size={14} /> : <Mic size={14} />}
              {speechToText.transcribing ? 'Đang nhận dạng...' : speechToText.recording ? 'Dừng' : 'Bấm để nói'}
            </button>
            <span className="text-[10px] text-gray-400">Ngôn ngữ: {sttLang === 'vi' ? 'Tiếng Việt' : 'English'}</span>
          </div>

          <textarea
            value={transcript}
            onChange={event => setTranscript(event.target.value)}
            rows={5}
            placeholder={mode === 'lesson' ? 'Bạn giảng lại bằng lời của mình... (càng cụ thể càng tốt)' : 'Transcript sẽ xuất hiện ở đây...'}
            className="w-full resize-none rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
          />

          {error && (
            <div className="mt-2 flex items-start gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="mt-3 space-y-2.5 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span className="text-[12px] font-semibold text-emerald-800">Đã ghi nhận recall</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${colorClass}`}>
                  Strength {schedule.strength ?? '—'} / 100
                </span>
                <span className="text-[10px] text-gray-500">
                  Ôn tiếp sau {schedule.intervalDays ?? 0} ngày · ease {schedule.easeFactor ?? '—'}
                </span>
              </div>

              {evalData.summary && (
                <p className="text-[12px] leading-relaxed text-gray-800">{evalData.summary}</p>
              )}

              {Array.isArray(evalData.mastered) && evalData.mastered.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase text-emerald-700">Đã nắm</div>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-[12px] text-gray-700">
                    {evalData.mastered.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}

              {Array.isArray(evalData.gap) && evalData.gap.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase text-rose-700">Còn thiếu / sai</div>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-[12px] text-gray-700">
                    {evalData.gap.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}

              {evalData.nextFocus && (
                <div className="rounded-md border border-indigo-100 bg-white/60 px-2.5 py-1.5 text-[11px] text-indigo-700">
                  <span className="font-bold">Gợi ý ôn tiếp: </span>{evalData.nextFocus}
                </div>
              )}

              {mode === 'shadow' && Array.isArray(evalData.diff) && evalData.diff.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase text-amber-700">Khác biệt phát hiện</div>
                  <p className="text-[12px] text-gray-700">{evalData.diff.join(', ')}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-emerald-200/50 pt-2">
                <span className="text-[10px] text-gray-500">Đánh giá thủ công (override):</span>
                {[20, 40, 60, 80, 100].map(score => (
                  <button
                    key={score}
                    onClick={() => setManualStrength(score)}
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-bold transition ${
                      manualStrength === score
                        ? 'border-indigo-500 bg-indigo-500 text-white'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {score}
                  </button>
                ))}
                {manualStrength != null && (
                  <button
                    onClick={() => setManualStrength(null)}
                    className="text-[10px] text-gray-500 hover:text-rose-600"
                  >
                    Bỏ override
                  </button>
                )}
              </div>
            </div>
          )}

          {gap && !result && (
            <div className="mt-3 rounded-lg border border-black/[0.06] bg-gray-50/60 p-3 text-[11px] text-gray-600">
              <div className="mb-1 font-semibold uppercase text-gray-500">Lần recall trước</div>
              {gap.summary && <p className="leading-relaxed">{gap.summary}</p>}
              {Array.isArray(gap.gap) && gap.gap.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {gap.gap.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-black/[0.06] bg-gray-50/60 px-4 py-2.5">
          <span className="text-[10px] text-gray-500">
            {transcript.length} ký tự · {transcript.trim().split(/\s+/).filter(Boolean).length} từ
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Đóng
            </button>
            <button
              onClick={submit}
              disabled={busy === 'submit' || !transcript.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy === 'submit' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Ghi nhận recall
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
