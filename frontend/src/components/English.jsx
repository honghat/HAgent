import { useEffect, useMemo, useState, useRef } from 'react'
import { 
  Check, Languages, RefreshCw, Search, Volume2, Mic, 
  BookOpen, PenTool, Layers, Filter, Play, Square, 
  GraduationCap, Book, MessageSquare, Headphones,
  Menu, X, ChevronRight, LayoutGrid, Award, Settings2
} from 'lucide-react'

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

export default function English({ token }) {
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

  const units = useMemo(() => {
    const uMap = {}
    items.forEach(item => {
      let meta = {}
      try { meta = JSON.parse(item.metadata || '{}') } catch (e) {}
      const u = meta.unit || 0
      if (!uMap[u]) uMap[u] = { id: u, title: meta.unitTitle || `Bài ${u}`, items: [] }
      uMap[u].items.push(item)
    })
    return Object.values(uMap).sort((a, b) => b.id - a.id)
  }, [items])

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
        return order.indexOf(a.type) - order.indexOf(b.type)
      })
  }, [currentUnit, type, query])

  const currentItem = useMemo(() => {
    return items.find(item => item.id === currentId) || filteredItems[0] || null
  }, [currentId, filteredItems, items])

  const meta = useMemo(() => {
    try { return JSON.parse(currentItem?.metadata || '{}') }
    catch (e) { return {} }
  }, [currentItem])

  const load = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/english', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      const data = await res.json()
      setItems(Array.isArray(data) ? data : [])
    } catch { setItems([]) }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [token])

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
        body: JSON.stringify({ level, mode })
      })
      if (res.ok) {
        setBatchMsg('Đã tạo bài mới!')
        load()
      } else {
        const err = await res.json()
        setBatchMsg(`Lỗi: ${err.error || 'Tạo thất bại'}`)
      }
    } catch (e) { setBatchMsg('Lỗi kết nối') }
    finally { 
      setBatchRunning(false)
      setTimeout(() => setBatchMsg(''), 5000)
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
    setBusy(true)
    setFeedback('')
    try {
      const res = await fetch('/api/english/check', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: userText, 
          context: currentItem.content,
          type: 'writing'
        })
      })
      const data = await res.json()
      setFeedback(data.feedback || 'Đã kiểm tra xong.')
      if (res.ok) {
        // Mark as completed
        fetch('/api/english', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentId, completed: true })
        }).then(() => load())
      }
    } catch { setFeedback('Đánh giá thất bại.') }
    finally { setBusy(false) }
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

        <div className="flex-1 flex overflow-hidden relative">
          {/* 3. Skills List */}
          <aside className={`absolute inset-y-0 right-0 z-20 w-72 bg-white border-l border-slate-100 transform transition-transform duration-300 md:relative md:translate-x-0 ${showSkills ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
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
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.completed && <Check size={10} className="text-emerald-500" />}
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
              <div className="max-w-2xl mx-auto space-y-6">
                <header className="pb-4 border-b border-slate-100 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Bài {currentUnit?.id} • {TYPE_LABELS[currentItem.type] || currentItem.type}</div>
                    <h1 className="text-lg font-black text-slate-900 leading-tight tracking-tight">{getItemTitle(currentItem)}</h1>
                  </div>
                  <button onClick={() => speak(currentItem.content || meta.word)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-bold text-[10px] text-white ${isPlaying ? 'bg-slate-900' : 'bg-slate-700'}`}>
                    {isPlaying ? <Square size={12} fill="white" /> : <Play size={12} fill="white" />}
                    {isPlaying ? 'Dừng' : 'Nghe'}
                  </button>
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
                    <div className="text-base leading-relaxed text-slate-700 font-medium whitespace-pre-line border-l-2 border-indigo-100 pl-4 py-1">
                      {currentItem.content}
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

                  {feedback && (
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-slate-900">
                      <div className="flex items-center gap-2 mb-2">
                        <Award size={18} className="text-slate-600" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Nhận xét</span>
                      </div>
                      <p className="text-sm font-bold leading-relaxed">{feedback}</p>
                    </div>
                  )}

                  {currentItem.type === 'writing' && (
                    <div className="pt-8 border-t border-slate-100 space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-slate-400">
                        <PenTool size={14} />
                        Bài viết
                      </h4>
                      <textarea
                        value={userText}
                        onChange={e => setUserText(e.target.value)}
                        placeholder="Nhập câu trả lời..."
                        className="w-full h-32 p-3 rounded-md bg-slate-50 border border-transparent focus:bg-white focus:border-slate-400 transition-all text-sm font-medium outline-none resize-none"
                      />
                      <button 
                        onClick={handleCheckWriting}
                        disabled={busy || !userText.trim()}
                        className="w-full py-2 rounded-md bg-slate-800 text-white font-bold hover:bg-black disabled:opacity-50 transition-all text-sm"
                      >
                        {busy ? 'Đang chấm...' : 'Kiểm tra bài viết'}
                      </button>
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
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {units.map(u => (
                <button key={u.id} onClick={() => { setSelectedUnit(u.id); setCurrentId(null); setShowCurriculum(false); }} className={`w-full text-left p-3 rounded-xl border transition-all ${selectedUnit === u.id ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'border-transparent text-slate-600'}`}>
                  <div className="text-[8px] font-bold opacity-50 uppercase">Bài {u.id}</div>
                  <div className="text-xs font-bold">{u.title}</div>
                </button>
              ))}
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
