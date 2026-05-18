import { useEffect, useMemo, useState, useRef } from 'react'
import { 
  Check, Languages, RefreshCw, Search, Volume2, Mic, 
  BookOpen, PenTool, Layers, Filter, Play, Square, 
  GraduationCap, Book, MessageSquare, Headphones,
  Menu, X, ChevronRight, LayoutGrid, Award, Settings2
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const TYPES = [
  { id: 'all', label: 'Tất cả', icon: <Layers size={14} /> },
  { id: 'vocab', label: 'Từ vựng', icon: <Book size={14} /> },
  { id: 'grammar', label: 'Ngữ pháp', icon: <BookOpen size={14} /> },
  { id: 'listen', label: 'Nghe', icon: <Headphones size={14} /> },
  { id: 'speak', label: 'Nói', icon: <MessageSquare size={14} /> },
  { id: 'reading', label: 'Đọc', icon: <BookOpen size={14} /> },
  { id: 'writing', label: 'Viết', icon: <PenTool size={14} /> },
]

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1']
const MODES = [
  { id: 'coder', label: 'Lập trình' },
  { id: 'communication', label: 'Giao tiếp' },
  { id: 'business', label: 'Công việc' },
  { id: 'ielts', label: 'Luyện thi' },
]

const VOICES = [
  { id: 'en-US-AvaNeural', label: 'Ava (US)' },
  { id: 'en-US-AndrewNeural', label: 'Andrew (US)' },
]

const TYPE_LABELS = Object.fromEntries(TYPES.map(item => [item.id, item.label]))

function isLearned(item) {
  return !!item?.completed || Number(item?.learnCount || 0) > 0
}

function extractJson(raw = '') {
  const text = String(raw).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const arrayStart = text.indexOf('[')
  const arrayEnd = text.lastIndexOf(']')
  const objectStart = text.indexOf('{')
  const objectEnd = text.lastIndexOf('}')
  if (arrayStart >= 0 && arrayEnd > arrayStart && (objectStart < 0 || arrayStart < objectStart)) {
    try { return JSON.parse(text.slice(arrayStart, arrayEnd + 1)) } catch (e) {}
  }
  if (objectStart >= 0 && objectEnd > objectStart) {
    try { return JSON.parse(text.slice(objectStart, objectEnd + 1)) } catch (e) {}
  }
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    try { return JSON.parse(text.slice(arrayStart, arrayEnd + 1)) } catch (e) {}
  }
  return null
}

function MarkdownLesson({ children }) {
  return (
    <div className="border-l-2 border-indigo-100 pl-4 py-1 text-slate-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-4 text-2xl font-black leading-tight text-slate-900">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-6 text-xl font-black leading-tight text-slate-900">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-3 mt-5 text-lg font-black leading-tight text-slate-900">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-2 mt-4 text-base font-black leading-tight text-slate-900">{children}</h4>,
          p: ({ children }) => <p className="mb-4 text-sm font-medium leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="mb-4 list-disc space-y-2 pl-6 text-sm font-medium leading-relaxed">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 list-decimal space-y-2 pl-6 text-sm font-medium leading-relaxed">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-black text-slate-900">{children}</strong>,
          em: ({ children }) => <em className="italic text-indigo-700">{children}</em>,
          blockquote: ({ children }) => <blockquote className="mb-4 border-l-4 border-slate-200 pl-4 italic text-slate-600">{children}</blockquote>,
          table: ({ children }) => <div className="mb-4 overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>,
          th: ({ children }) => <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-black text-slate-900">{children}</th>,
          td: ({ children }) => <td className="border border-slate-200 px-3 py-2 align-top">{children}</td>,
          code: ({ children }) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm font-semibold text-slate-900">{children}</code>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

export default function English({ token, provider, cxModel }) {
  const [items, setItems] = useState([])
  const [type, setType] = useState('all')
  const [level, setLevel] = useState('A2')
  const [selectedUnit, setSelectedUnit] = useState(null)
  const [mode, setMode] = useState('coder')
  const [query, setQuery] = useState('')
  const [currentId, setCurrentId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  
  // UI State - Sidebar toggles
  const [showCurriculum, setShowCurriculum] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  
  const [voice, setVoice] = useState('en-US-AvaNeural')
  const [speed, setSpeed] = useState(1.0)
  const [batchMsg, setBatchMsg] = useState('')
  const [batchRunning, setBatchRunning] = useState(false)

  // Interaction State
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [feedback, setFeedback] = useState('')
  const [userText, setUserText] = useState('')
  const [quizAnswers, setQuizAnswers] = useState({})
  
  const audioRef = useRef(null)
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null

  const levelItems = useMemo(() => {
    return items.filter(item => {
      let meta = {}
      try { meta = JSON.parse(item.metadata || '{}') } catch (e) {}
      return meta.level === level
    })
  }, [items, level])

  const units = useMemo(() => {
    const uMap = {}
    levelItems.forEach(item => {
      let meta = {}
      try { meta = JSON.parse(item.metadata || '{}') } catch (e) {}
      const u = meta.unit || 0
      if (!uMap[u]) uMap[u] = { id: u, title: meta.unitTitle || `Bài ${u}`, items: [] }
      uMap[u].items.push(item)
    })
    return Object.values(uMap).sort((a, b) => b.id - a.id)
  }, [levelItems])

  const currentUnit = useMemo(() => {
    const uId = selectedUnit || (units.length > 0 ? units[0].id : null)
    return units.find(u => u.id === uId)
  }, [units, selectedUnit])

  const filteredItems = useMemo(() => {
    if (!currentUnit) return []
    return currentUnit.items
      .filter(item => type === 'all' || item.type === type)
      .filter(item => {
        if (!query.trim()) return true
        let meta = {}
        try { meta = JSON.parse(item.metadata || '{}') } catch (e) {}
        return (item.title || meta.word || '').toLowerCase().includes(query.toLowerCase())
      })
      .sort((a, b) => {
        const order = ['vocab', 'grammar', 'listen', 'speak', 'reading', 'writing']
        const learnedDiff = Number(isLearned(a)) - Number(isLearned(b))
        if (learnedDiff !== 0) return learnedDiff
        return order.indexOf(a.type) - order.indexOf(b.type)
      })
  }, [currentUnit, type, query])

  const currentItem = useMemo(() => {
    return levelItems.find(item => item.id === currentId) || filteredItems[0] || null
  }, [currentId, filteredItems, levelItems])

  const meta = useMemo(() => {
    try { return JSON.parse(currentItem?.metadata || '{}') }
    catch (e) { return {} }
  }, [currentItem])

  const providerModel = provider === 'cx' ? cxModel : ''

  const askAgent = async (prompt, temperature = 0.6) => {
    const res = await fetch('/api/hagent-ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        model: providerModel,
        temperature,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.detail || data.error || 'AI không phản hồi')
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('AI trả về rỗng')
    return content
  }

  const load = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/english', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      const data = await res.json()
      const nextItems = Array.isArray(data) ? data : []
      setItems(nextItems)
      return nextItems
    } catch {
      setItems([])
      return []
    }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [token])
  useEffect(() => {
    setSelectedUnit(null)
    setCurrentId(null)
    setQuery('')
  }, [level])

  const speak = async (text) => {
    if (!text) return
    if (isPlaying) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
      if (synth) synth.cancel()
      setIsPlaying(false)
      return
    }
    setIsPlaying(true)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, speed, server: 'edge' })
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        if (audioRef.current) {
          audioRef.current.src = url
          audioRef.current.onended = () => { URL.revokeObjectURL(url); setIsPlaying(false); }
          await audioRef.current.play()
          return
        }
      }
    } catch (e) {}
    if (synth) {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-US'; u.rate = speed; u.onend = () => setIsPlaying(false);
      synth.speak(u)
    } else setIsPlaying(false)
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('Xóa bài này?')) return
    setBusy(true)
    try {
      const res = await fetch('/api/english', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (res.ok) {
        if (currentId === id) setCurrentId(null)
        load()
      }
    } catch { alert('Xóa thất bại') }
    finally { setBusy(false) }
  }

  const handleGenNext = async () => {
    if (batchRunning) return
    setBatchRunning(true)
    setBatchMsg('Đang tạo bài mới...')
    try {
      const res = await fetch('/api/english/gen-batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, mode, provider, model: provider === 'cx' ? cxModel : '' })
      })
      if (res.ok) {
        setBatchMsg('Đã tạo bài mới!')
        load()
      } else {
        const err = await res.json().catch(() => ({}))
        setBatchMsg(`Lỗi: ${err.error || 'Tạo thất bại'}`)
      }
    } catch (e) { setBatchMsg('Lỗi kết nối') }
    finally { 
      setBatchRunning(false)
      setTimeout(() => setBatchMsg(''), 5000)
    }
  }

  const saveEnglishItem = async (type, content, metadata) => {
    const res = await fetch('/api/english', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content, metadata })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Không lưu được bài')
    return data
  }

  const handleGenerateSkill = async (skillType) => {
    if (busy) return
    const unitNum = currentUnit?.id || selectedUnit || (units[0]?.id ? units[0].id + 1 : 1)
    const unitTitle = currentUnit?.title || `Bài ${unitNum}`
    const modeLabel = MODES.find(m => m.id === mode)?.label || mode
    const baseMeta = { level, mode, unit: unitNum, unitTitle }
    const label = TYPE_LABELS[skillType] || skillType
    setBusy(`gen-${skillType}`)
    setBatchMsg(`Đang tạo ${label.toLowerCase()}...`)
    setFeedback('')
    try {
      const shared = `Cấp độ: ${level}. Chủ đề/ngữ cảnh: ${unitTitle}. Mode: ${modeLabel}. Người học Việt Nam. Nội dung phải đúng CEFR ${level}, ngắn gọn, thực dụng.`
      if (skillType === 'vocab') {
        const raw = await askAgent(`${shared}\nTạo 10 từ vựng tiếng Anh hữu ích. Return JSON array ONLY: [{"word":"...","ipa":"...","def":"short English definition","ex":"Example sentence","vi":"nghĩa tiếng Việt"}]`)
        const words = extractJson(raw)
        if (!Array.isArray(words) || !words.length) throw new Error('AI trả từ vựng không đúng JSON')
        let firstId = ''
        for (const w of words) {
          if (!w?.word) continue
          const saved = await saveEnglishItem('vocab', w.word, { ...baseMeta, word: w.word, ipa: w.ipa || '', def: w.def || '', ex: w.ex || '', vi: w.vi || '', topic: unitTitle })
          if (!firstId) firstId = saved.id
        }
        await load()
        if (firstId) setCurrentId(firstId)
      } else {
        const prompts = {
          grammar: `${shared}\nSoạn 1 bài ngữ pháp ngắn bằng tiếng Việt. Return JSON ONLY: {"title":"...","content":"...","topic":"..."}`,
          listen: `${shared}\nTạo 1 bài nghe 4-6 câu tiếng Anh. Return JSON ONLY: {"title":"...","en":"...","vi":"dịch tiếng Việt","vocab":[{"w":"...","m":"..."}]}`,
          speak: `${shared}\nTạo 1 câu hỏi luyện nói. Return JSON ONLY: {"title":"...","topic":"question only","hint":"short Vietnamese hint"}`,
          reading: `${shared}\nTạo 1 bài đọc ngắn. Return JSON ONLY: {"title":"...","body":"...","questions":[{"q":"...","options":["A","B","C","D"],"answer":0}]}`,
          writing: `${shared}\nTạo 1 đề viết ngắn. Return JSON ONLY: {"title":"...","prompt":"...","hint":"short Vietnamese hint"}`
        }
        const raw = await askAgent(prompts[skillType] || prompts.grammar)
        const data = extractJson(raw)
        if (!data || Array.isArray(data)) throw new Error('AI trả bài không đúng JSON')
        const payload = {
          grammar: { content: data.content || raw, metadata: { ...baseMeta, title: data.title || 'Ngữ pháp', topic: data.topic || data.title || unitTitle } },
          listen: { content: data.en || raw, metadata: { ...baseMeta, title: data.title || 'Bài nghe', vi: data.vi || '', vocab: data.vocab || [], topic: unitTitle } },
          speak: { content: '', metadata: { ...baseMeta, title: data.title || 'Bài nói', topic: data.topic || '', hint: data.hint || '' } },
          reading: { content: data.body || raw, metadata: { ...baseMeta, title: data.title || 'Bài đọc', topic: unitTitle, questions: data.questions || [] } },
          writing: { content: '', metadata: { ...baseMeta, title: data.title || 'Bài viết', prompt: data.prompt || '', hint: data.hint || '' } }
        }[skillType]
        const saved = await saveEnglishItem(skillType, payload.content, payload.metadata)
        await load()
        setCurrentId(saved.id)
      }
      setSelectedUnit(unitNum)
      setBatchMsg(`Đã tạo ${label.toLowerCase()}.`)
    } catch (err) {
      setBatchMsg(`Lỗi: ${err.message}`)
    } finally {
      setBusy(false)
      setTimeout(() => setBatchMsg(''), 5000)
    }
  }

  const handleGenerateCurrentSkill = () => {
    const skillType = type === 'all' ? (currentItem?.type || 'vocab') : type
    handleGenerateSkill(skillType)
  }

  const handleSuggest = async () => {
    if (!currentItem || busy) return
    setBusy('suggest')
    setFeedback('')
    try {
      const prompt = `Bạn là giáo viên tiếng Anh. Hãy gợi ý ngắn gọn bằng tiếng Việt cho học viên làm bài sau, KHÔNG làm hộ toàn bộ.\nCấp độ: ${level}\nKỹ năng: ${TYPE_LABELS[currentItem.type] || currentItem.type}\nTiêu đề: ${getItemTitle(currentItem)}\nNội dung: ${currentItem.content || meta.prompt || meta.topic || meta.word || ''}\nTrả lời dạng bullet ngắn.`
      setFeedback(await askAgent(prompt, 0.4))
    } catch (err) {
      setFeedback(`Lỗi gợi ý: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const handleAiGrade = async () => {
    if (!currentItem || busy) return
    const answer = userText.trim() || transcript.trim()
    if (!answer) {
      setFeedback('Nhập câu trả lời trước khi chấm AI.')
      return
    }
    setBusy('grade')
    setFeedback('')
    try {
      const prompt = `Bạn là giám khảo tiếng Anh cho học viên Việt Nam. Chấm câu trả lời theo cấp ${level}.
Kỹ năng: ${TYPE_LABELS[currentItem.type] || currentItem.type}
Đề bài/ngữ cảnh: ${currentItem.content || meta.prompt || meta.topic || meta.word || getItemTitle(currentItem)}
Câu trả lời của học viên:
${answer}

Trả về tiếng Việt, gọn:
Điểm: x/10
Nhận xét:
Sửa lỗi:
Câu tốt hơn:`
      const result = await askAgent(prompt, 0.3)
      setFeedback(result)
      await fetch('/api/english', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentItem.id, completed: true, incrementLearnCount: true })
      }).catch(() => {})
      load()
    } catch (err) {
      setFeedback(`Lỗi chấm AI: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const handleQuizSubmit = async () => {
    const questions = meta.questions || []
    if (questions.length === 0) return
    let score = 0
    questions.forEach((q, idx) => { if (quizAnswers[idx] === q.correct) score++ })
    setBusy(true)
    try {
      const res = await fetch('/api/english', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentItem.id, completed: true, quizScore: score, quizTotal: questions.length, incrementLearnCount: true })
      })
      if (res.ok) {
        setFeedback(`Hoàn thành bài kiểm tra: ${score}/${questions.length}. Đã cập nhật SRS.`)
        load()
      }
    } catch { setFeedback('Cập nhật thất bại') }
    finally { setBusy(false) }
  }

  const handleCheckWriting = async () => {
    if (!userText.trim()) return
    handleAiGrade()
  }

  const handleToggleLearned = async () => {
    if (!currentItem || busy) return
    const nextCompleted = !isLearned(currentItem)
    setBusy(`learned-${currentItem.id}`)
    try {
      const res = await fetch('/api/english', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentItem.id, completed: nextCompleted, incrementLearnCount: nextCompleted })
      })
      if (!res.ok) throw new Error('Không cập nhật được bài học')
      await load()
      if (nextCompleted) setCurrentId(null)
    } catch (err) {
      setFeedback(`Lỗi đánh dấu: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const getItemTitle = (item) => {
    let m = {}
    try { m = JSON.parse(item.metadata || '{}') } catch (e) {}
    return item.title || m.title || m.word || m.topic || m.prompt || (item.content?.substring(0, 30) + '...') || 'Nhiệm vụ bài học'
  }

  return (
    <div className="flex h-full w-full bg-white text-slate-900 font-sans overflow-hidden">
      <audio ref={audioRef} hidden />

      {/* 1. Curriculum Sidebar (Desktop) */}
      <aside className="hidden lg:flex flex-col w-52 border-r border-slate-100 bg-[#FBFBFC] shrink-0">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="text-indigo-600" size={18} />
            <h1 className="font-bold text-xs tracking-tight">Lộ trình</h1>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <select value={level} onChange={e => setLevel(e.target.value)} className="bg-white border border-slate-200 rounded-md px-2 py-1 text-[9px] font-bold">
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={mode} onChange={e => setMode(e.target.value)} className="bg-white border border-slate-200 rounded-md px-2 py-1 text-[9px] font-bold">
              {MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {units.map(u => (
            <button
              key={u.id}
              onClick={() => { setSelectedUnit(u.id); setCurrentId(null); }}
              className={`w-full text-left p-2 rounded-md transition-all ${selectedUnit === u.id || (!selectedUnit && u.id === units[0]?.id) ? 'bg-white border border-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <div className="text-[9px] font-bold opacity-50 uppercase tracking-tighter">Bài {u.id}</div>
              <div className="text-[11px] font-bold truncate">{u.title}</div>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <button 
            onClick={handleGenNext}
            disabled={batchRunning}
            className="w-full py-2 rounded-lg bg-slate-800 text-white text-[10px] font-bold hover:bg-slate-900 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw size={12} className={batchRunning ? 'animate-spin' : ''} />
            {batchRunning ? 'Đang tạo...' : 'Bài mới'}
          </button>
          {batchMsg && <p className="text-[9px] text-center font-bold text-indigo-600 mt-2 animate-pulse">{batchMsg}</p>}
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Mobile Header - More compact */}
        <header className="lg:hidden flex items-center justify-between px-3 h-11 border-b border-slate-100 bg-white sticky top-0 z-10">
          <button onClick={() => setShowCurriculum(true)} className="p-2 text-slate-600"><Menu size={20} /></button>
          <div className="text-xs font-black uppercase tracking-widest truncate max-w-[200px]">
            {currentUnit?.title}
          </div>
          <div className="w-10" /> {/* Spacer to keep title centered */}
        </header>

        {/* Skill Tabs */}
        <nav className="h-10 border-b border-slate-100 flex items-center gap-1 px-3 overflow-x-auto no-scrollbar bg-slate-50/50">
          {TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => { setType(t.id); setShowSkills(true); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold whitespace-nowrap transition-all ${type === t.id ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-white border border-transparent hover:border-slate-200'}`}
            >
              <span className="scale-90">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 bg-white px-3 py-1.5 no-scrollbar">
          <button
            type="button"
            onClick={handleGenerateCurrentSkill}
            disabled={!!busy || batchRunning}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-slate-900 px-2.5 text-[10px] font-bold text-white hover:bg-black disabled:opacity-50"
            title={`Tạo ${TYPE_LABELS[type === 'all' ? (currentItem?.type || 'vocab') : type]?.toLowerCase() || 'bài học'}`}
          >
            <RefreshCw size={12} className={String(busy).startsWith('gen-') ? 'animate-spin' : ''} />
            <span>{String(busy).startsWith('gen-') ? 'Đang tạo...' : 'Tạo bài'}</span>
          </button>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={!currentItem || !!busy}
            className="h-7 shrink-0 rounded-md border border-indigo-100 bg-indigo-50 px-2 text-[10px] font-bold text-indigo-700 disabled:opacity-50"
          >
            Gợi ý
          </button>
          <button
            type="button"
            onClick={handleAiGrade}
            disabled={!currentItem || !!busy}
            className="h-7 shrink-0 rounded-md bg-slate-800 px-2 text-[10px] font-bold text-white disabled:opacity-50"
          >
            Chấm AI
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden relative">
          {/* 3. Skills List */}
          <aside className={`absolute inset-y-0 right-0 z-20 w-72 bg-white border-l border-slate-100 transform transition-transform duration-300 md:relative md:w-60 md:translate-x-0 ${showSkills ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
            <div className="p-3 border-b border-slate-50 flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm bài..." className="w-full pl-9 pr-3 py-1.5 bg-slate-100 border-none rounded-md text-xs font-semibold outline-none focus:ring-1 focus:ring-slate-400" />
              </div>
              <button onClick={() => setShowSkills(false)} className="md:hidden text-slate-400 p-2"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
              {filteredItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setCurrentId(item.id); setShowSkills(false); }}
                  className={`group w-full text-left p-2.5 rounded-lg border transition-all ${currentItem?.id === item.id ? 'bg-white border-slate-300' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">{TYPE_LABELS[item.type] || item.type}</span>
                    <div className="flex items-center gap-2">
                      {isLearned(item) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black uppercase text-emerald-700">
                          <Check size={9} />
                          Đã học
                        </span>
                      )}
                      <div onClick={(e) => handleDelete(item.id, e)} className="p-1 hover:bg-rose-50 rounded-md text-slate-300 hover:text-rose-500 transition-colors">
                        <X size={12} />
                      </div>
                    </div>
                  </div>
                  <div className="text-[12px] font-black leading-tight line-clamp-2">{getItemTitle(item)}</div>
                </button>
              ))}
            </div>
          </aside>

          {/* 4. Detailed Content */}
          <article className="flex-1 overflow-y-auto bg-white custom-scrollbar p-5 md:p-8">
            {currentItem ? (
              <div className="max-w-6xl mx-auto space-y-6">
                <header className="pb-4 border-b border-slate-100 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Bài {currentUnit?.id} • {TYPE_LABELS[currentItem.type] || currentItem.type}</div>
                    <h1 className="text-base font-black text-slate-900 leading-tight tracking-tight">{getItemTitle(currentItem)}</h1>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={handleToggleLearned}
                      disabled={!!busy}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-bold transition-all disabled:opacity-50 ${isLearned(currentItem) ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      <Check size={12} />
                      {isLearned(currentItem) ? 'Đã học' : 'Đánh dấu'}
                    </button>
                    <button onClick={() => speak(currentItem.content || meta.word)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-bold text-[10px] text-white ${isPlaying ? 'bg-slate-900' : 'bg-slate-700'}`}>
                      {isPlaying ? <Square size={12} fill="white" /> : <Play size={12} fill="white" />}
                      {isPlaying ? 'Dừng' : 'Nghe'}
                    </button>
                  </div>
                </header>

                <div className="space-y-6">
                  {currentItem.type === 'vocab' && meta.word && (
                    <div className="p-5 bg-slate-50 rounded-lg text-center border border-slate-100">
                      <div className="text-3xl font-black text-slate-900 mb-1 tracking-tighter">{meta.word}</div>
                      {meta.ipa && <div className="text-sm font-medium text-indigo-600 font-mono mb-2">/{meta.ipa}/</div>}
                      <div className="text-base text-slate-600 font-medium leading-relaxed">{meta.vi}</div>
                    </div>
                  )}

                  {currentItem.content && (
                    currentItem.type === 'grammar'
                      ? <MarkdownLesson>{currentItem.content}</MarkdownLesson>
                      : (
                        <div className="text-lg leading-relaxed text-slate-700 font-medium whitespace-pre-line border-l-2 border-indigo-100 pl-4 py-1">
                          {currentItem.content}
                        </div>
                      )
                  )}

                  {(meta.prompt || meta.topic || meta.hint) && (
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      {meta.prompt && (
                        <>
                          <div className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Đề bài</div>
                          <p className="text-sm font-bold leading-relaxed text-slate-800">{meta.prompt}</p>
                        </>
                      )}
                      {!meta.prompt && meta.topic && (
                        <>
                          <div className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Câu hỏi</div>
                          <p className="text-sm font-bold leading-relaxed text-slate-800">{meta.topic}</p>
                        </>
                      )}
                      {meta.hint && <p className="mt-2 text-xs font-semibold leading-relaxed text-indigo-700">Gợi ý: {meta.hint}</p>}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {meta.def && (
                      <div className="p-3 bg-white border border-slate-100 rounded-md">
                        <div className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest">Định nghĩa</div>
                        <p className="text-sm font-bold text-slate-800 leading-relaxed">{meta.def}</p>
                      </div>
                    )}
                    {meta.ex && (
                      <div className="p-3 bg-white border border-slate-100 rounded-md">
                        <div className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest">Ví dụ</div>
                        <p className="text-sm font-bold text-slate-800 italic leading-relaxed">"{meta.ex}"</p>
                      </div>
                    )}
                  </div>

                  {meta.questions?.length > 0 && (
                    <div className="pt-8 border-t border-slate-100 space-y-6">
                      <h4 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                        <Award size={16} className="text-amber-500" />
                        Bài luyện tập
                      </h4>
                      <div className="space-y-6">
                        {meta.questions.map((q, qIdx) => (
                          <div key={qIdx} className="space-y-3">
                            <p className="text-base font-black leading-snug">{qIdx + 1}. {q.q}</p>
                            <div className="grid grid-cols-1 gap-2">
                              {q.options?.map((opt, oIdx) => (
                                <button
                                  key={oIdx}
                                  onClick={() => setQuizAnswers({ ...quizAnswers, [qIdx]: oIdx })}
                                  className={`text-left p-2.5 rounded-md border font-semibold transition-all text-xs ${quizAnswers[qIdx] === oIdx ? 'bg-slate-700 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200'}`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        <button 
                          onClick={handleQuizSubmit}
                          disabled={busy || Object.keys(quizAnswers).length < meta.questions.length}
                          className="w-full py-2 rounded-md bg-slate-800 text-white font-bold hover:bg-black disabled:opacity-50 transition-all text-sm"
                        >
                          {busy ? 'Đang chấm...' : 'Nộp bài'}
                        </button>
                      </div>
                    </div>
                  )}

                  {currentItem.type !== 'vocab' && (
                    <div className="pt-8 border-t border-slate-100 space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-slate-400">
                        <PenTool size={14} />
                        Câu trả lời
                      </h4>
                      <textarea
                        value={userText}
                        onChange={e => setUserText(e.target.value)}
                        placeholder="Nhập câu trả lời để chấm AI..."
                        className="w-full h-32 p-3 rounded-md bg-slate-50 border border-transparent focus:bg-white focus:border-slate-400 transition-all text-sm font-medium outline-none resize-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={handleSuggest}
                          disabled={!!busy}
                          className="py-2 rounded-md border border-indigo-100 bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100 disabled:opacity-50 transition-all text-xs"
                        >
                          Gợi ý
                        </button>
                        <button
                          onClick={handleAiGrade}
                          disabled={!!busy || !userText.trim()}
                          className="py-2 rounded-md bg-slate-800 text-white font-bold hover:bg-black disabled:opacity-50 transition-all text-xs"
                        >
                          {busy === 'grade' ? 'Đang chấm...' : 'Chấm điểm bằng AI'}
                        </button>
                      </div>
                    </div>
                  )}

                  {feedback && (
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-slate-900">
                      <div className="flex items-center gap-2 mb-2">
                        <Award size={18} className="text-slate-600" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Nhận xét</span>
                      </div>
                      <p className="whitespace-pre-line text-sm font-bold leading-relaxed">{feedback}</p>
                    </div>
                  )}

                  {currentItem.type === 'speak' && (
                    <div className="p-6 bg-slate-900 rounded-2xl text-white flex flex-col items-center gap-4">
                      <button onClick={isRecording ? () => setIsRecording(false) : () => setIsRecording(true)} className={`w-12 h-12 rounded-full flex items-center justify-center ${isRecording ? 'bg-rose-500 animate-pulse' : 'bg-white/10 hover:bg-white/20'}`}>
                        <Mic size={20} />
                      </button>
                      <span className="text-[10px] font-bold opacity-60 uppercase tracking-widest">{isRecording ? 'Đang ghi âm...' : 'Nói ngay'}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-300">
                <LayoutGrid size={32} className="mb-2 opacity-20" />
                <p className="text-xs font-bold">Chọn một bài để bắt đầu</p>
              </div>
            )}
          </article>
        </div>
      </main>

      {/* 5. Mobile Curriculum Drawer */}
      {showCurriculum && (
        <div className="fixed inset-0 z-[100] flex">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowCurriculum(false)} />
          <aside className="relative w-64 bg-white h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-300">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-xs uppercase tracking-widest">Lộ trình</h2>
              <button onClick={() => setShowCurriculum(false)} className="text-slate-400"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3">
              <select value={level} onChange={e => setLevel(e.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold">
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={mode} onChange={e => setMode(e.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold">
                {MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {units.map(u => (
                <button key={u.id} onClick={() => { setSelectedUnit(u.id); setCurrentId(null); setShowCurriculum(false); }} className={`w-full text-left p-3 rounded-xl border transition-all ${selectedUnit === u.id ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'border-transparent text-slate-600'}`}>
                  <div className="text-[8px] font-bold opacity-50 uppercase">Bài {u.id}</div>
                  <div className="text-xs font-bold">{u.title}</div>
                </button>
              ))}
              {!units.length && (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-[11px] font-bold text-slate-400">
                  Chưa có bài cấp {level}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}} />
    </div>
  )
}
