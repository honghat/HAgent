import { useEffect, useState } from 'react'
import { Download, ExternalLink, File, FileText, Film, Image as ImageIcon, Music, RefreshCw, X } from 'lucide-react'

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.tif', '.heic', '.heif']
const BROWSER_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']
const VIDEO_EXTS = ['.mp4', '.webm', '.ogv', '.m4v', '.mov']
const AUDIO_EXTS = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus']
const OFFICE_EXTS = ['.doc', '.docx', '.pptx', '.xlsx', '.xlsm']
const PDF_EXTS = ['.pdf']
const TEXT_EXTS = [
  '.txt', '.md', '.markdown', '.json', '.csv', '.tsv', '.xml', '.html', '.htm',
  '.css', '.js', '.jsx', '.ts', '.tsx', '.py', '.sh', '.zsh', '.bash', '.yaml',
  '.yml', '.toml', '.ini', '.cfg', '.conf', '.log', '.env', '.sql', '.rtf',
]
const GOOGLE_NATIVE_PREFIX = 'application/vnd.google-apps.'

function auth(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function extOf(value = '') {
  return value.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
}

function tokenParam(token) {
  return token ? `&t=${encodeURIComponent(token)}` : ''
}

function localMediaUrl(path, token) {
  return `/api/files/files/media?path=${encodeURIComponent(path)}${tokenParam(token)}`
}

function localImageUrl(path, token, ext) {
  if (BROWSER_IMAGE_EXTS.includes(ext)) return localMediaUrl(path, token)
  return `/api/files/files/image-preview?path=${encodeURIComponent(path)}${tokenParam(token)}`
}

function drivePreviewUrl(accountId, itemId, token, download = false, thumbnail = false) {
  const params = new URLSearchParams({ account_id: accountId, item_id: itemId })
  if (download) params.set('download', 'true')
  if (thumbnail) params.set('thumbnail', 'true')
  if (token) params.set('t', token)
  return `/api/drive/sync/drive-preview?${params}`
}

function isTextLike(mimeType, ext) {
  return mimeType?.startsWith('text/') || TEXT_EXTS.includes(ext)
}

function renderOfficePreview(data) {
  if (data.kind === 'docx') {
    const paragraphs = data.paragraphs || []
    return (
      <div className="h-full overflow-auto bg-white p-5">
        <div className="mx-auto max-w-3xl space-y-3">
          {paragraphs.length === 0 ? (
            <p className="text-[12px] text-gray-400">Không có nội dung văn bản để hiển thị.</p>
          ) : paragraphs.map((paragraph, index) => (
            <p key={index} className="whitespace-pre-wrap text-[13px] leading-6 text-gray-800">{paragraph}</p>
          ))}
          {data.truncated && <p className="border-t border-amber-100 pt-3 text-[11px] text-amber-600">Đã rút gọn nội dung để xem nhanh.</p>}
        </div>
      </div>
    )
  }
  if (data.kind === 'pptx') {
    return (
      <div className="h-full overflow-auto bg-gray-50 p-5">
        <div className="mx-auto max-w-4xl space-y-4">
          {(data.slides || []).map(slide => (
            <section key={slide.index} className="rounded-lg border border-black/[0.08] bg-white p-4 shadow-sm">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-blue-500">Slide {slide.index}</div>
              <div className="space-y-2">
                {(slide.texts || []).length === 0 ? (
                  <p className="text-[12px] text-gray-400">Không có text trong slide này.</p>
                ) : slide.texts.map((text, index) => (
                  <p key={index} className="whitespace-pre-wrap text-[13px] leading-6 text-gray-700">{text}</p>
                ))}
              </div>
            </section>
          ))}
          {data.truncated && <p className="text-[11px] text-amber-600">Đã rút gọn số slide để xem nhanh.</p>}
        </div>
      </div>
    )
  }
  if (data.kind === 'xlsx') {
    return (
      <div className="h-full overflow-auto bg-gray-50 p-4">
        <div className="space-y-4">
          {(data.sheets || []).map(sheet => (
            <section key={sheet.name} className="overflow-hidden rounded-lg border border-black/[0.08] bg-white shadow-sm">
              <div className="border-b border-black/[0.06] px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-emerald-600">{sheet.name}</div>
              <div className="overflow-auto">
                <table className="min-w-full text-left text-[12px] text-gray-700">
                  <tbody>
                    {(sheet.rows || []).map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-black/[0.04] last:border-b-0">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="max-w-[260px] border-r border-black/[0.04] px-3 py-2 align-top last:border-r-0">
                            <div className="whitespace-pre-wrap break-words">{cell || '\u00A0'}</div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {data.truncated && <p className="text-[11px] text-amber-600">Đã rút gọn số sheet hoặc số dòng để xem nhanh.</p>}
        </div>
      </div>
    )
  }
  return null
}

export default function DrivePreviewModal({ token, request, onClose }) {
  const [state, setState] = useState({ status: 'idle' })

  useEffect(() => {
    if (!request) {
      setState({ status: 'idle' })
      return undefined
    }
    let stopped = false
    let objectUrl = ''
    const item = request.item || {}
    const name = item.name || item.path?.split('/').filter(Boolean).pop() || 'File'
    const ext = extOf(name || item.path)
    const base = {
      name,
      ext,
      size: item.size || 0,
      source: request.kind,
      externalUrl: item.webViewLink || '',
    }
    const commit = value => {
      if (!stopped) setState(value)
    }
    const ensureImageRenderable = url => new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = resolve
      image.onerror = () => reject(new Error('Browser không render được ảnh này'))
      image.src = url
    })
    const loadDriveImageUrl = async (url, label) => {
      const response = await fetch(url, { headers: auth(token) })
      if (!response.ok) throw new Error(`Không tải được ${label} trên Drive`)
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.startsWith('image/')) throw new Error(`Drive trả về ${contentType || 'không rõ'} thay vì ảnh`)
      const blob = await response.blob()
      const nextObjectUrl = URL.createObjectURL(blob)
      try {
        await ensureImageRenderable(nextObjectUrl)
      } catch (error) {
        URL.revokeObjectURL(nextObjectUrl)
        throw error
      }
      if (stopped) {
        URL.revokeObjectURL(nextObjectUrl)
        throw new Error('Preview đã đóng')
      }
      objectUrl = nextObjectUrl
      return nextObjectUrl
    }
    const loadDriveImageWithFallback = async (primaryUrl, fallbackUrl) => {
      try {
        return await loadDriveImageUrl(primaryUrl, 'ảnh gốc')
      } catch (error) {
        if (!fallbackUrl) throw error
        return await loadDriveImageUrl(fallbackUrl, 'thumbnail')
      }
    }

    async function load() {
      commit({ status: 'loading', ...base })
      try {
        if (request.kind === 'local') {
          if (IMAGE_EXTS.includes(ext)) {
            commit({ status: 'ready', type: 'image', url: localImageUrl(item.path, token, ext), downloadUrl: `/api/files/files/download?path=${encodeURIComponent(item.path)}${tokenParam(token)}`, ...base })
            return
          }
          if (PDF_EXTS.includes(ext)) {
            commit({ status: 'ready', type: 'pdf', url: localMediaUrl(item.path, token), downloadUrl: `/api/files/files/download?path=${encodeURIComponent(item.path)}${tokenParam(token)}`, ...base })
            return
          }
          if (VIDEO_EXTS.includes(ext)) {
            commit({ status: 'ready', type: 'video', url: localMediaUrl(item.path, token), downloadUrl: `/api/files/files/download?path=${encodeURIComponent(item.path)}${tokenParam(token)}`, ...base })
            return
          }
          if (AUDIO_EXTS.includes(ext)) {
            commit({ status: 'ready', type: 'audio', url: localMediaUrl(item.path, token), downloadUrl: `/api/files/files/download?path=${encodeURIComponent(item.path)}${tokenParam(token)}`, ...base })
            return
          }
          if (OFFICE_EXTS.includes(ext)) {
            const response = await fetch(`/api/files/files/office-preview?path=${encodeURIComponent(item.path)}`, { headers: auth(token) })
            const data = await response.json()
            if (!response.ok) throw new Error(data.detail || 'Không xem trước được file Office')
            commit({ status: 'ready', type: 'office', data, downloadUrl: `/api/files/files/download?path=${encodeURIComponent(item.path)}${tokenParam(token)}`, ...base })
            return
          }
          const response = await fetch(`/api/files/files/file?path=${encodeURIComponent(item.path)}`, { headers: auth(token) })
          const data = await response.json()
          if (!response.ok) throw new Error(data.detail || 'Không đọc được file')
          if (data.is_binary) {
            commit({ status: 'ready', type: 'unsupported', downloadUrl: `/api/files/files/download?path=${encodeURIComponent(item.path)}${tokenParam(token)}`, ...base })
          } else {
            commit({ status: 'ready', type: 'text', text: data.content || '', downloadUrl: `/api/files/files/download?path=${encodeURIComponent(item.path)}${tokenParam(token)}`, ...base })
          }
          return
        }

        const mimeType = item.mimeType || ''
        const previewUrl = drivePreviewUrl(request.accountId, item.id, token)
        const downloadUrl = drivePreviewUrl(request.accountId, item.id, token, true)
        if (mimeType.startsWith(GOOGLE_NATIVE_PREFIX)) {
          commit({ status: 'ready', type: 'pdf', url: previewUrl, downloadUrl, ...base })
          return
        }
        if (IMAGE_EXTS.includes(ext) || mimeType.startsWith('image/')) {
          const thumbnailUrl = drivePreviewUrl(request.accountId, item.id, token, false, true)
          const imageUrl = await loadDriveImageWithFallback(previewUrl, thumbnailUrl)
          commit({ status: 'ready', type: 'image', url: imageUrl, downloadUrl, ...base })
          return
        }
        if (PDF_EXTS.includes(ext) || mimeType === 'application/pdf') {
          commit({ status: 'ready', type: 'pdf', url: previewUrl, downloadUrl, ...base })
          return
        }
        if (VIDEO_EXTS.includes(ext) || mimeType.startsWith('video/')) {
          commit({ status: 'ready', type: 'video', url: previewUrl, downloadUrl, ...base })
          return
        }
        if (AUDIO_EXTS.includes(ext) || mimeType.startsWith('audio/')) {
          commit({ status: 'ready', type: 'audio', url: previewUrl, downloadUrl, ...base })
          return
        }
        if (OFFICE_EXTS.includes(ext)) {
          const params = new URLSearchParams({ account_id: request.accountId, item_id: item.id })
          if (token) params.set('t', token)
          const response = await fetch(`/api/drive/sync/drive-office-preview?${params}`, { headers: auth(token) })
          const data = await response.json()
          if (!response.ok) throw new Error(data.detail || 'Không xem trước được file Office trên Drive')
          commit({ status: 'ready', type: 'office', data, downloadUrl, ...base, externalUrl: data.webViewLink || base.externalUrl })
          return
        }
        if (isTextLike(mimeType, ext)) {
          const response = await fetch(previewUrl, { headers: auth(token) })
          if (!response.ok) throw new Error('Không đọc được file text trên Drive')
          const text = await response.text()
          commit({ status: 'ready', type: 'text', text, downloadUrl, ...base })
          return
        }
        commit({ status: 'ready', type: 'unsupported', downloadUrl, ...base })
      } catch (error) {
        if (!stopped) setState({ status: 'error', message: String(error.message || error), ...base })
      }
    }

    load()
    return () => {
      stopped = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [request, token])

  if (!request) return null

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="flex h-[82vh] w-[min(980px,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-xl border border-black/[0.12] bg-white shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/[0.08] bg-gray-50 px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm">
            {state.type === 'image' ? <ImageIcon size={15} /> : state.type === 'video' ? <Film size={15} /> : state.type === 'audio' ? <Music size={15} /> : state.type === 'text' || state.type === 'office' ? <FileText size={15} /> : <File size={15} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-bold text-gray-900">{state.name || 'Xem trước'}</p>
            <p className="truncate text-[10.5px] text-gray-400">{request.kind === 'drive' ? `Google Drive${request.accountEmail ? ` · ${request.accountEmail}` : ''}` : 'Local'}</p>
          </div>
          {state.externalUrl && (
            <a href={state.externalUrl} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-semibold text-gray-500 hover:bg-white hover:text-blue-600">
              <ExternalLink size={12} /> Mở
            </a>
          )}
          {state.downloadUrl && (
            <a href={state.downloadUrl} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-semibold text-gray-500 hover:bg-white hover:text-gray-900">
              <Download size={12} /> Tải
            </a>
          )}
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:text-gray-700">
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {state.status === 'loading' ? (
            <div className="flex h-full items-center justify-center gap-2 text-[12px] text-gray-400">
              <RefreshCw size={14} className="animate-spin" /> Đang mở preview...
            </div>
          ) : state.status === 'error' ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <File size={34} className="text-gray-300" />
              <p className="text-[12.5px] font-semibold text-gray-700">Không xem trước được file này</p>
              <p className="max-w-md text-[11px] leading-5 text-gray-400">{state.message}</p>
            </div>
          ) : state.type === 'image' ? (
            <div className="flex h-full items-center justify-center bg-gray-950 p-3">
              <img src={state.url} alt={state.name} className="max-h-full max-w-full rounded-lg object-contain" />
            </div>
          ) : state.type === 'pdf' ? (
            <iframe src={state.url} title={state.name} className="h-full w-full bg-white" />
          ) : state.type === 'video' ? (
            <div className="flex h-full items-center justify-center bg-gray-950 p-3">
              <video src={state.url} controls autoPlay className="max-h-full max-w-full rounded-lg" />
            </div>
          ) : state.type === 'audio' ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-gray-950 p-6">
              <Music size={42} className="text-gray-500" />
              <p className="max-w-md truncate text-[12px] font-semibold text-gray-200">{state.name}</p>
              <audio src={state.url} controls autoPlay className="w-[min(420px,90%)]" />
            </div>
          ) : state.type === 'text' ? (
            <pre className="h-full overflow-auto whitespace-pre-wrap break-words bg-gray-950 p-4 font-mono text-[12px] leading-5 text-gray-100">{state.text}</pre>
          ) : state.type === 'office' ? (
            renderOfficePreview(state.data)
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <File size={34} className="text-gray-300" />
              <p className="text-[12.5px] font-semibold text-gray-700">Định dạng này chưa có preview inline</p>
              <p className="max-w-md text-[11px] leading-5 text-gray-400">Có thể mở bằng Google Drive hoặc tải file về máy.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
