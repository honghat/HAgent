import { useEffect, useRef, useState } from 'react'
import { BookOpen, Download, FileJson, Loader2, Play, RefreshCw, Square, Trash2, Wifi } from 'lucide-react'
import Toast, { useToast } from './Toast'

const AUTO_IMPORT_KEY = 'hagent_ttv_auto_import'

function Section({ title, icon, children }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-black/[0.02]">
      <div className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-gray-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  )
}

async function readJson(res) {
  const text = await res.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { throw new Error(res.ok ? 'Phản hồi không hợp lệ' : text) }
}

export default function TtvManager({ token, embedded = false }) {
  const auth = { Authorization: `Bearer ${token}` }
  const [proxyStatus, setProxyStatus] = useState(null)
  const [proxyPort, setProxyPort] = useState(8899)
  const [proxyBusy, setProxyBusy] = useState('')
  const [ttvProfile, setTtvProfile] = useState(null)
  const [apiBusy, setApiBusy] = useState(false)
  const [autoImport, setAutoImport] = useState(() => localStorage.getItem(AUTO_IMPORT_KEY) !== '0')
  const { toast, showToast, dismissToast } = useToast()
  const lastImportCaptureRef = useRef(0)
  const importBusyRef = useRef(false)

  useEffect(() => {
    loadProxyStatus()
    loadTtvProfile()
  }, [])

  useEffect(() => {
    localStorage.setItem(AUTO_IMPORT_KEY, autoImport ? '1' : '0')
  }, [autoImport])

  useEffect(() => {
    const timer = window.setInterval(() => loadProxyStatus(true), 3000)
    return () => window.clearInterval(timer)
  }, [autoImport])

  const loadProxyStatus = async (silent = false) => {
    try {
      const res = await fetch('/api/app-tools/ttv/proxy/status', { headers: auth })
      const data = await readJson(res)
      if (!res.ok) throw new Error(data.detail || 'Không đọc được proxy status')
      setProxyStatus(data)
      if (data.proxy_port) setProxyPort(data.proxy_port)
      if (!lastImportCaptureRef.current) lastImportCaptureRef.current = data.capture_count || 0
      if (autoImport && data.capture_count > lastImportCaptureRef.current && !importBusyRef.current) {
        await importCapture(true, data.capture_count)
      }
    } catch (e) {
      if (!silent) showToast(e.message, 'error', 5000)
    }
  }

  const loadTtvProfile = async () => {
    try {
      const res = await fetch('/api/app-tools/ttv/profile', { headers: auth })
      const data = await readJson(res)
      if (!res.ok) throw new Error(data.detail || 'Không đọc được API TTV')
      setTtvProfile(Object.keys(data || {}).length ? data : null)
    } catch {
      setTtvProfile(null)
    }
  }

  const analyzeTtvApi = async () => {
    setApiBusy(true)
    try {
      const res = await fetch('/api/app-tools/ttv/proxy/analyze', { method: 'POST', headers: auth })
      const data = await readJson(res)
      if (!res.ok) throw new Error(data.detail || 'Phân tích API TTV thất bại')
      setTtvProfile(data)
      const endpointCount = Object.keys(data.preferred_endpoints || {}).length
      showToast(`Đã cập nhật API TTV: ${endpointCount} endpoint, ${data.candidates?.length || 0} request.`, 'success')
    } catch (e) {
      showToast(e.message, 'error', 5000)
    } finally {
      setApiBusy(false)
    }
  }

  const runProxyAction = async (action, body = null) => {
    setProxyBusy(action)
    try {
      const res = await fetch(`/api/app-tools/ttv/proxy/${action}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await readJson(res)
      if (!res.ok) throw new Error(data.detail || `Proxy ${action} thất bại`)
      setProxyStatus(data)
      if (data.proxy_port) setProxyPort(data.proxy_port)
      lastImportCaptureRef.current = data.capture_count || 0
      if (action === 'start') showToast('Proxy đã bật. Cấu hình iPad vào IP/port bên dưới rồi mở truyện/chương trong app TTV.', 'success')
      else if (action === 'clear') showToast('Đã xoá capture cũ.', 'success')
      else if (action === 'stop') showToast('Proxy đã tắt.', 'info')
    } catch (e) {
      showToast(e.message, 'error', 5000)
    } finally {
      setProxyBusy('')
    }
  }

  const importCapture = async (auto = false, captureCount = null) => {
    importBusyRef.current = true
    if (!auto) setProxyBusy('import')
    try {
      const res = await fetch('/api/app-tools/ttv/proxy/import', { method: 'POST', headers: auth })
      const data = await readJson(res)
      if (!res.ok) throw new Error(data.detail || 'Nhập capture thất bại')
      lastImportCaptureRef.current = captureCount ?? data.capture_count ?? lastImportCaptureRef.current
      const detail = []
      if (data.chapter_metadata) detail.push(`dò mục lục ${data.chapter_metadata} chương`)
      if (data.chapter_contents) detail.push(`lưu nội dung ${data.chapter_contents} chương`)
      if (data.api_contents) detail.push(`tự tải nội dung ${data.api_contents} chương`)
      if (data.api_failed) detail.push(`${data.api_failed} chương chưa tải được`)
      showToast(`${auto ? 'Tự nhập' : 'Đã nhập'} ${data.stories || 0} truyện, ${data.chapters || 0} chương từ capture${detail.length ? ` (${detail.join(', ')})` : ''}.`, 'success', 5000)
      await loadProxyStatus(true)
      await loadTtvProfile()
    } catch (e) {
      showToast(e.message, 'error', 5000)
    } finally {
      importBusyRef.current = false
      if (!auto) setProxyBusy('')
    }
  }

  const clearTtvStories = async () => {
    setProxyBusy('clear-stories')
    try {
      const res = await fetch('/api/app-tools/ttv/stories/clear', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear_capture: true }),
      })
      const data = await readJson(res)
      if (!res.ok) throw new Error(data.detail || 'Xoá TTV thất bại')
      lastImportCaptureRef.current = 0
      showToast(`Đã xoá ${data.stories_deleted || 0} truyện TTV và ${data.chapters_deleted || 0} chương. Capture cũ đã xoá.`, 'success')
      await loadProxyStatus(true)
    } catch (e) {
      showToast(e.message, 'error', 5000)
    } finally {
      setProxyBusy('')
    }
  }

  const outerClass = embedded ? '' : 'h-full overflow-y-auto bg-[var(--color-bg)] px-4 py-5'
  const innerClass = embedded ? 'flex flex-col gap-4' : 'mx-auto flex max-w-xl flex-col gap-4'

  return (
    <div className={outerClass}>
      <Toast toast={toast} onClose={dismissToast} />
      <div className={innerClass}>
        <div className="flex items-center gap-2 px-1">
          <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600"><BookOpen className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-extrabold text-gray-800">Quản lý Tàng Thư Viện</h2>
            <p className="text-[12px] text-gray-400">Lấy truyện, mục lục và nội dung qua API thật nae.vn.</p>
          </div>
        </div>

        <Section title="API TTV" icon={<FileJson className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Base URL</div>
              <div className="break-all font-mono text-[12px] font-black text-gray-800">
                {ttvProfile?.api_base_urls?.[0] || '-'}
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Endpoint</div>
              <div className="text-sm font-black text-gray-800">
                {Object.keys(ttvProfile?.preferred_endpoints || {}).length || 0}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-gray-400">{ttvProfile?.candidates?.length || 0} request</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Cập nhật</div>
              <div className="text-[12px] font-bold text-gray-700">
                {ttvProfile?.updated_at ? new Date(ttvProfile.updated_at * 1000).toLocaleString('vi-VN') : 'Chưa có'}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-gray-400">{ttvProfile?.hosts?.[0] || 'Chưa có host'}</div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={analyzeTtvApi}
              disabled={apiBusy || !(proxyStatus?.capture_count)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-[12px] font-semibold text-white transition-all hover:bg-amber-600 disabled:opacity-50"
            >
              {apiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Phân tích API từ capture
            </button>
            <button
              onClick={loadTtvProfile}
              disabled={apiBusy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-600 transition-all hover:border-amber-300 hover:text-amber-700 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tải profile
            </button>
          </div>

          {ttvProfile?.preferred_endpoints && Object.keys(ttvProfile.preferred_endpoints).length > 0 ? (
            <div className="mt-3 space-y-2">
              {Object.entries(ttvProfile.preferred_endpoints).slice(0, 6).map(([name, endpoint]) => (
                <div key={name} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">{name}</div>
                  <div className="break-all font-mono text-[11px] text-gray-600">
                    <span className="font-black text-gray-800">{endpoint.method}</span> {endpoint.path}
                  </div>
                  {!!endpoint.query_keys?.length && (
                    <div className="mt-1 break-all text-[11px] font-semibold text-gray-400">
                      query: {endpoint.query_keys.join(', ')}
                    </div>
                  )}
                  {!!endpoint.body_keys?.length && (
                    <div className="mt-1 break-all text-[11px] font-semibold text-gray-400">
                      schema: {endpoint.body_keys.slice(0, 12).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[11px] leading-5 text-gray-400">Chưa có profile API TTV. Bật proxy, mở app TTV trên iPad để tạo capture, rồi phân tích API từ capture.</p>
          )}
        </Section>

        <Section title="Proxy iPad tự lưu" icon={<Wifi className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-1 font-bold uppercase tracking-wider text-gray-400">Server</div>
              <div className="font-mono text-sm font-black text-gray-800">{proxyStatus?.proxy_server || '-'}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-1 font-bold uppercase tracking-wider text-gray-400">Port</div>
              <input
                type="number"
                min="1024"
                max="65535"
                value={proxyPort}
                onChange={e => setProxyPort(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 font-mono text-sm font-black text-gray-800 outline-none focus:border-amber-400"
              />
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-1 font-bold uppercase tracking-wider text-gray-400">Trạng thái</div>
              <div className={`text-sm font-black ${proxyStatus?.running ? 'text-green-700' : 'text-gray-500'}`}>
                {proxyStatus?.running ? 'Đang chạy' : 'Đang tắt'}
              </div>
              <div className="mt-1 font-semibold text-gray-400">{proxyStatus?.capture_count || 0} capture</div>
            </div>
          </div>

          <label className="mt-3 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
            <input
              type="checkbox"
              checked={autoImport}
              onChange={e => setAutoImport(e.target.checked)}
              className="h-4 w-4 accent-amber-600"
            />
            Tự lưu truyện/chương khi iPad phát sinh capture mới
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => runProxyAction('start', { port: Number(proxyPort) || 8899, clear_capture: false })}
              disabled={!!proxyBusy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-[12px] font-semibold text-white transition-all hover:bg-green-700 disabled:opacity-50"
            >
              {proxyBusy === 'start' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Khởi động proxy
            </button>
            <button
              onClick={() => runProxyAction('stop')}
              disabled={!!proxyBusy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-[12px] font-semibold text-white transition-all hover:bg-black disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5" />
              Tắt
            </button>
            <button
              onClick={() => importCapture(false)}
              disabled={!!proxyBusy || !(proxyStatus?.capture_count)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-600 transition-all hover:border-amber-300 hover:text-amber-700 disabled:opacity-50"
            >
              {proxyBusy === 'import' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Nhập ngay
            </button>
            <button
              onClick={() => runProxyAction('clear')}
              disabled={!!proxyBusy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-600 transition-all hover:border-red-200 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Xoá capture
            </button>
            <button
              onClick={clearTtvStories}
              disabled={!!proxyBusy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-600 transition-all hover:bg-red-100 disabled:opacity-50"
            >
              {proxyBusy === 'clear-stories' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Xoá truyện TTV
            </button>
            <button
              onClick={() => loadProxyStatus()}
              disabled={!!proxyBusy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-600 transition-all hover:border-amber-300 hover:text-amber-700 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-gray-400">Trên iPad đặt Wi-Fi proxy Manual tới Server/Port này, mở <span className="font-mono font-bold">http://mitm.it</span> để cài CA, rồi mở truyện và chương 1 trong app TTV. Khi capture có id truyện/chương, web tự lưu mục lục và tự tải nội dung các chương còn thiếu.</p>
        </Section>
      </div>
    </div>
  )
}
