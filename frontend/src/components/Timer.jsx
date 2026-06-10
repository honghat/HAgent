import { useState, useEffect, useRef } from 'react'

const WORK_MIN = 50
const BREAK_MIN = 10
const MAX_SESSIONS = 16

export default function Timer({ token }) {
  const auth = (h) => ({ ...h, Authorization: `Bearer ${token}` })
  const today = new Date().toISOString().slice(0, 10)
  const [mode, setMode] = useState('work')
  const [remaining, setRemaining] = useState(WORK_MIN * 60)
  const [sessions, setSessions] = useState(0)
  const [running, setRunning] = useState(false)
  const [target, setTarget] = useState(MAX_SESSIONS)
  const [currentEndTime, setCurrentEndTime] = useState(0)
  const intervalRef = useRef(null)

  useEffect(() => {
    fetch(`/api/learn/pomodoro?date=${today}`, { headers: auth({}) })
      .then((r) => r.json())
      .then((d) => {
        setSessions(d.sessions || 0)
        const now = Date.now()
        if (d.currentEndTime && d.currentEndTime > now) {
          setRunning(true)
          setMode(d.currentMode || 'work')
          setRemaining(d.currentEndTime - now)
          setCurrentEndTime(d.currentEndTime)
        }
      })
      .catch(() => {})
  }, [today])

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1000) {
            clearInterval(intervalRef.current)
            handleTimerEnd()
            return 0
          }
          return prev - 1000
        })
      }, 1000)
    }
    return () => clearInterval(intervalRef.current)
  }, [running])

  useEffect(() => {
    if (running) {
      const endTime = Date.now() + remaining
      setCurrentEndTime(endTime)
      fetch('/api/learn/pomodoro', {
        method: 'POST', headers: auth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ date: today, currentEndTime: endTime, currentMode: mode, sessions }),
      }).catch(() => {})
    }
  }, [running, remaining])

  function handleTimerEnd() {
    setRunning(false)
    setCurrentEndTime(0)
    if (mode === 'work') {
      const newSessions = sessions + 1
      setSessions(newSessions)
      fetch('/api/learn/pomodoro', {
        method: 'POST', headers: auth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ date: today, sessions: newSessions, currentEndTime: 0, currentMode: 'break' }),
      }).catch(() => {})
      setMode('break')
      setRemaining(BREAK_MIN * 60)
    } else {
      setMode('work')
      setRemaining(WORK_MIN * 60)
    }
  }

  function toggleTimer() {
    if (running) {
      clearInterval(intervalRef.current)
      setRunning(false)
      fetch('/api/learn/pomodoro', {
        method: 'POST', headers: auth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ date: today, currentEndTime: 0, currentMode: mode, sessions }),
      }).catch(() => {})
    } else {
      setRunning(true)
    }
  }

  function switchMode(m) {
    if (running) return
    setMode(m)
    setRemaining(m === 'work' ? WORK_MIN * 60 : BREAK_MIN * 60)
  }

  function formatTime(s) {
    const m = Math.floor(s / 60000)
    const sec = Math.floor((s % 60000) / 1000)
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const pct = mode === 'work'
    ? ((WORK_MIN * 60 - remaining) / (WORK_MIN * 60)) * 100
    : ((BREAK_MIN * 60 - remaining) / (BREAK_MIN * 60)) * 100

  return (
    <div className="p-4 max-w-md mx-auto text-center">
      <h1 className="text-lg font-black mb-1">🍅 Pomodoro</h1>
      <p className="text-[10px] text-gray-400 mb-6">{today}</p>

      <div className="flex justify-center gap-2 mb-6">
        <button onClick={() => switchMode('work')}
          className={`px-4 py-1.5 rounded-full text-xs font-bold border cursor-pointer transition-all ${
            mode === 'work' ? 'bg-orange-500 text-white border-orange-500' : 'bg-transparent text-gray-400 border-black/[0.08]'
          }`}>Tập trung</button>
        <button onClick={() => switchMode('break')}
          className={`px-4 py-1.5 rounded-full text-xs font-bold border cursor-pointer transition-all ${
            mode === 'break' ? 'bg-blue-500 text-white border-blue-500' : 'bg-transparent text-gray-400 border-black/[0.08]'
          }`}>Nghỉ ngơi</button>
      </div>

      <div className="relative w-64 h-64 mx-auto mb-6">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-bg-2)" strokeWidth="6" />
          <circle cx="50" cy="50" r="45" fill="none" stroke={mode === 'work' ? '#f97316' : '#3b82f6'} strokeWidth="6"
            strokeDasharray={`${2 * Math.PI * 45}`}
            strokeDashoffset={`${2 * Math.PI * 45 * (1 - pct / 100)}`}
            strokeLinecap="round" className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black tracking-widest">{formatTime(remaining)}</span>
          <span className="text-xs text-gray-400 mt-1 uppercase tracking-wider">{mode === 'work' ? 'Đang học' : 'Nghỉ giải lao'}</span>
        </div>
      </div>

      <button onClick={toggleTimer}
        className={`px-10 py-3 rounded-full text-sm font-bold text-white border-none cursor-pointer transition-all ${
          running ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-900 hover:bg-gray-700'
        }`}>{running ? '■ Dừng' : '▶ Bắt đầu'}</button>

      <div className="mt-8 bg-[var(--color-bg-2)] rounded-xl p-4 border border-black/[0.06]">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-gray-400">Hôm nay</span>
          <span className="text-lg font-black text-orange-500">{sessions} <span className="text-xs text-gray-400 font-normal">/ {target}</span></span>
        </div>
        <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${(sessions / target) * 100}%` }} />
        </div>
        <div className="flex justify-center gap-1 mt-3">
          {Array.from({ length: target }, (_, i) => (
            <div key={i} className={`w-3 h-3 rounded-sm ${i < sessions ? 'bg-orange-500' : 'bg-black/[0.06]'}`} />
          ))}
        </div>
      </div>
    </div>
  )
}
