import { useEffect, useRef, useState, useCallback } from 'react'

const STT_ENDPOINT = '/api/stt'
const SILENCE_MS = 1500
const RMS_THRESHOLD = 0.015
const MIN_SPEECH_MS = 400

function preferredMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  return candidates.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || ''
}

function extForMime(type) {
  const mime = String(type || '').split(';', 1)[0]
  if (mime === 'audio/mp4') return 'm4a'
  if (mime === 'audio/ogg') return 'ogg'
  return 'webm'
}

export function useHandsFreeVoice({ token, onTranscript, onError, paused, language = '', prompt = '' }) {
  const [enabled, setEnabled] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)

  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const vadRafRef = useRef(null)
  const speechStartRef = useRef(null)
  const lastVoiceRef = useRef(null)
  const enabledRef = useRef(false)
  const pausedRef = useRef(false)

  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => { pausedRef.current = paused }, [paused])

  const cleanup = useCallback(() => {
    if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current)
    vadRafRef.current = null
    try { recorderRef.current?.stop() } catch {}
    recorderRef.current = null
    streamRef.current?.getTracks?.().forEach(t => t.stop())
    streamRef.current = null
    try { audioCtxRef.current?.close() } catch {}
    audioCtxRef.current = null
    analyserRef.current = null
    speechStartRef.current = null
    lastVoiceRef.current = null
    chunksRef.current = []
    setListening(false)
  }, [])

  async function sendBlob(blob) {
    if (!blob?.size) return
    setTranscribing(true)
    try {
      const fd = new FormData()
      fd.append('audio', blob, `voice.${extForMime(blob.type)}`)
      if (language) fd.append('language', language)
      if (prompt) fd.append('prompt', prompt)
      fd.append('temperature', '0')
      const res = await fetch(STT_ENDPOINT, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || data.error || 'STT thất bại')
      const text = String(data.text || data.transcript || '').trim()
      if (text) onTranscript?.(text)
    } catch (err) {
      onError?.(err?.message || 'STT lỗi')
    } finally {
      setTranscribing(false)
    }
  }

  const startListening = useCallback(async () => {
    if (recorderRef.current || pausedRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
      })
      streamRef.current = stream

      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      audioCtxRef.current = ctx
      if (ctx.state === 'suspended') {
        try { await ctx.resume() } catch {}
      }
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      analyserRef.current = analyser

      const mime = preferredMimeType()
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []
      speechStartRef.current = null
      lastVoiceRef.current = null

      recorder.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        chunksRef.current = []
        streamRef.current?.getTracks?.().forEach(t => t.stop())
        streamRef.current = null
        try { audioCtxRef.current?.close() } catch {}
        audioCtxRef.current = null
        analyserRef.current = null
        recorderRef.current = null
        setListening(false)
        const hadSpeech = speechStartRef.current !== null
        speechStartRef.current = null
        if (hadSpeech) sendBlob(blob)
      }
      recorder.start(100)
      setListening(true)

      const buf = new Float32Array(analyser.fftSize)
      const tick = () => {
        if (!analyserRef.current) return
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const rms = Math.sqrt(sum / buf.length)
        const now = performance.now()

        if (rms > RMS_THRESHOLD) {
          if (!speechStartRef.current) speechStartRef.current = now
          lastVoiceRef.current = now
        } else if (speechStartRef.current && lastVoiceRef.current) {
          const speechDuration = lastVoiceRef.current - speechStartRef.current
          const silenceDuration = now - lastVoiceRef.current
          if (speechDuration >= MIN_SPEECH_MS && silenceDuration >= SILENCE_MS) {
            try { recorderRef.current?.stop() } catch {}
            return
          }
        }
        vadRafRef.current = requestAnimationFrame(tick)
      }
      vadRafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      cleanup()
      onError?.(err?.name === 'NotAllowedError' ? 'Chưa cấp quyền micro' : 'Không mở được micro')
      setEnabled(false)
    }
  }, [token, onTranscript, onError, cleanup])

  const stopListening = useCallback(() => {
    if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current)
    vadRafRef.current = null
    speechStartRef.current = null
    try { recorderRef.current?.stop() } catch { cleanup() }
  }, [cleanup])

  useEffect(() => {
    if (enabled && !paused && !recorderRef.current && !transcribing) {
      startListening()
    } else if ((!enabled || paused) && recorderRef.current) {
      stopListening()
    }
  }, [enabled, paused, transcribing, startListening, stopListening])

  useEffect(() => () => cleanup(), [cleanup])

  const toggle = useCallback(() => setEnabled(v => !v), [])

  return { enabled, listening, transcribing, toggle, setEnabled }
}
