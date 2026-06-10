import { useEffect, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const STT_ENDPOINT = `${API_BASE}/api/stt`

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function preferredMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  return candidates.find(type => window.MediaRecorder?.isTypeSupported?.(type)) || ''
}

function extensionForMimeType(type) {
  const mime = String(type || '').split(';', 1)[0]
  if (mime === 'audio/mp4') return 'm4a'
  if (mime === 'audio/ogg') return 'ogg'
  if (mime === 'audio/wav') return 'wav'
  return 'webm'
}

async function readJsonResponse(res) {
  const raw = await res.text()
  if (!raw) return {}
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(`STT API không trả JSON (HTTP ${res.status}). Kiểm tra proxy/backend.`)
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`STT API trả JSON lỗi định dạng (HTTP ${res.status}).`)
  }
}

export function useSpeechToText({ token, onTranscript, onError, onTiming, language = '', prompt = '', provider = 'groq' }) {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])

  function stopStream() {
    streamRef.current?.getTracks?.().forEach(track => track.stop())
    streamRef.current = null
  }

  async function sendAudio(blob) {
    if (!blob?.size) {
      onError?.('Không thu được âm thanh.')
      return
    }

    setTranscribing(true)
    try {
      const startedAt = performance.now()
      const formData = new FormData()
      const ext = extensionForMimeType(blob.type)
      formData.append('audio', blob, `voice.${ext}`)
      if (language) formData.append('language', language)
      if (prompt) formData.append('prompt', prompt)
      formData.append('provider', provider || 'groq')
      formData.append('temperature', '0')
      const res = await fetch(STT_ENDPOINT, {
        method: 'POST',
        headers: authHeaders(token),
        body: formData,
      })
      const data = await readJsonResponse(res)
      if (!res.ok) {
        throw new Error(data.detail || data.error || data.message || 'STT thất bại.')
      }
      const transcript = String(data.text || data.transcript || '').trim()
      if (!transcript) {
        onError?.('STT không nhận được nội dung.')
        return
      }
      onTiming?.(((performance.now() - startedAt) / 1000).toFixed(2))
      onTranscript?.(transcript)
    } catch (err) {
      const message = err?.message || 'Không gửi được audio tới STT server.'
      onError?.(message)
    } finally {
      setTranscribing(false)
    }
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onError?.('Trình duyệt không hỗ trợ ghi âm.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = preferredMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      streamRef.current = stream
      recorderRef.current = recorder
      recorder.ondataavailable = event => {
        if (event.data?.size) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        chunksRef.current = []
        stopStream()
        sendAudio(blob)
      }
      recorder.start()
      setRecording(true)
    } catch (err) {
      stopStream()
      onError?.(err?.name === 'NotAllowedError' ? 'Bạn chưa cấp quyền micro.' : 'Không mở được micro.')
    }
  }

  function stop() {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    } else {
      stopStream()
    }
    recorderRef.current = null
    setRecording(false)
  }

  function toggle() {
    if (recording) stop()
    else start()
  }

  useEffect(() => () => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }
    stopStream()
  }, [])

  return { recording, transcribing, toggle, stop }
}
