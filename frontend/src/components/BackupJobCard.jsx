import {
  HardDrive, X, RefreshCw, CheckCircle2, Clock, Ban, AlertCircle, ArrowRight, Trash2,
  Upload, SkipForward, FileUp, RotateCw,
} from 'lucide-react'

const STATUS_META = {
  pending:   { label: 'Đang chờ', cls: 'bg-amber-50 text-amber-700', icon: Clock },
  running:   { label: 'Đang chạy', cls: 'bg-blue-50 text-blue-700', icon: RefreshCw },
  done:      { label: 'Hoàn tất', cls: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  cancelled: { label: 'Đã huỷ', cls: 'bg-gray-100 text-gray-500', icon: Ban },
  error:     { label: 'Lỗi', cls: 'bg-red-50 text-red-700', icon: AlertCircle },
}

function fmtBytes(b) {
  if (!b) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++ }
  return `${b.toFixed(b >= 100 || i === 0 ? 0 : 1)} ${u[i]}`
}

export default function BackupJobCard({ job, onCancel, onDelete, onRerun }) {
  const meta = STATUS_META[job.status] || STATUS_META.pending
  const Icon = meta.icon
  const uploaded = Number(job.files_done || 0)
  const skipped = Number(job.skipped || 0)
  const processed = Number.isFinite(Number(job.files_processed)) ? Number(job.files_processed) : uploaded + skipped
  const total = Number(job.files_total || 0)
  const currentBytesDone = Math.max(0, Number(job.current_bytes_done || 0))
  const currentBytesTotal = Math.max(0, Number(job.current_bytes_total || 0))
  const currentFilePct = currentBytesTotal > 0 ? Math.min(1, currentBytesDone / currentBytesTotal) : 0
  const processedWithCurrent = Math.min(total, processed + (Number.isFinite(currentFilePct) ? currentFilePct : 0))
  const pctDone = total > 0 ? Math.round((processedWithCurrent / total) * 100) : 0
  const visibleBytesDone = Math.max(0, Number(job.bytes_done || 0)) + currentBytesDone
  const sourceName = job.source.split('/').filter(Boolean).pop() || job.source
  const processTitle = job.title || job.map_name || ''
  const name = processTitle || sourceName
  const isDownload = job.type === 'download' || (job.type === 'move' && job.phase === 'download')
  const isActive = job.status === 'running' || job.status === 'pending'
  const canCancel = isActive && !job.historical
  const canDelete = onDelete && (!isActive || job.historical)
  const canRerun = onRerun && job.map_id && !isActive && job.type !== 'download' && job.type !== 'move'
  const finishedDate = job.finished_at ? new Date(typeof job.finished_at === 'number' && job.finished_at < 1e12 ? job.finished_at * 1000 : job.finished_at) : null
  const finishedText = finishedDate && !Number.isNaN(finishedDate.getTime()) ? finishedDate.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''
  const currentFileBasename = job.current_file?.split('/').filter(Boolean).pop() || job.current_file || ''

  return (
    <div className="rounded-xl border border-black/[0.08] bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900/[0.04]">
            <HardDrive size={15} className="text-gray-500" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-gray-900">{name}</p>
            <p className="truncate text-[10.5px] text-gray-400">
              {processTitle ? `Quy trình · ${job.source}` : job.source}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
            <Icon size={10} className={job.status === 'running' ? 'animate-spin' : ''} />
            {meta.label}
          </span>
          {canRerun && (
            <button onClick={() => onRerun(job)} className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-100" title="Làm lại lượt sao lưu này">
              <RotateCw size={12} />
              Làm lại
            </button>
          )}
          {canCancel && (
            <button onClick={() => onCancel(job.id)} className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" title="Huỷ">
              <X size={13} />
            </button>
          )}
          {canDelete && (
            <button onClick={() => onDelete(job)} className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500" title="Xoá khỏi lịch sử">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {isActive && (
        <div className="mt-3">
          {/* Progress bar + percentage */}
          <div className="mb-1.5 flex items-center justify-between text-[10.5px]">
            <span className="font-bold text-gray-700">{pctDone}%</span>
            <span className="text-gray-400">{fmtBytes(visibleBytesDone)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-gradient-to-r from-slate-700 to-gray-900 transition-all duration-300" style={{ width: `${pctDone}%` }} />
          </div>

          {/* Stats chips */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              <FileUp size={9} className="text-gray-400" />
              {processed}/{total} xử lý
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              <Upload size={9} />
              {uploaded} {isDownload ? 'tải xuống' : 'tải lên'}
            </span>
            {skipped > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                <SkipForward size={9} />
                {skipped} bỏ qua
              </span>
            )}
          </div>

          {/* Current file being uploaded */}
          {currentFileBasename && (
            <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <ArrowRight size={10} className="shrink-0 text-blue-500 animate-pulse" />
                <span className="min-w-0 truncate text-[10.5px] font-medium text-gray-700">{currentFileBasename}</span>
              </div>
              {currentBytesTotal > 0 && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200">
                    <div className="h-full rounded-full bg-blue-500 transition-all duration-200" style={{ width: `${Math.round(currentFilePct * 100)}%` }} />
                  </div>
                  <span className="shrink-0 text-[9.5px] font-semibold text-blue-600">{Math.round(currentFilePct * 100)}%</span>
                  <span className="shrink-0 text-[9.5px] text-gray-400">{fmtBytes(currentBytesDone)}/{fmtBytes(currentBytesTotal)}</span>
                </div>
              )}
              {job.current_account && (
                <span className="mt-0.5 block text-[9.5px] text-gray-400">→ {job.current_account}</span>
              )}
            </div>
          )}
        </div>
      )}

      {job.status === 'done' && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
            <Upload size={10} />
            {uploaded} tệp đã {job.type === 'move' ? 'di chuyển' : (isDownload ? 'tải xuống' : 'sao lưu')}
          </span>
          {skipped > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-amber-600">
              <SkipForward size={10} />
              {skipped} bỏ qua
            </span>
          )}
          <span className="text-gray-400">{fmtBytes(job.bytes_done)}</span>
          {finishedText && <span className="text-gray-400">{finishedText}</span>}
        </div>
      )}

      {job.errors?.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-red-500">{job.errors.length} lỗi</summary>
          <ul className="mt-1.5 space-y-1 rounded-lg bg-red-50/60 p-2 text-[10.5px] text-red-600">
            {job.errors.slice(0, 20).map((e, i) => <li key={i} className="truncate">{e}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}
