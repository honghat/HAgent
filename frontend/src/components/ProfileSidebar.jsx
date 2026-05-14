import { FileText, FolderInput, Loader2, Upload } from 'lucide-react'

export default function ProfileSidebar({ profiles, selectedId, onSelect, localPath, onLocalPathChange, onImport, onUpload, loading }) {
  return (
    <aside className="w-72 border-r border-gray-100 bg-gray-50/40 hidden lg:flex flex-col">
      <div className="p-5 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-gray-900" />
          <h1 className="text-sm font-semibold text-gray-900">CV Jobs</h1>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={localPath}
              onChange={e => onLocalPathChange(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-600 outline-none focus:ring-2 focus:ring-gray-100"
            />
            <button onClick={onImport} disabled={loading} title="Import đường dẫn local" className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center disabled:opacity-40">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderInput className="w-4 h-4" />}
            </button>
          </div>
          <label className="h-9 rounded-lg border border-gray-100 bg-white text-gray-500 hover:text-gray-900 flex items-center justify-center gap-1.5 text-[11px] font-medium cursor-pointer">
            <Upload className="w-4 h-4" />
            Upload CV
            <input type="file" accept=".doc,.docx,.pdf,.txt" onChange={onUpload} className="hidden" />
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {profiles.map(profile => (
          <button
            key={profile.id}
            onClick={() => onSelect(profile.id)}
            className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedId === profile.id ? 'bg-white border-gray-200 shadow-sm' : 'bg-transparent border-transparent hover:bg-white hover:border-gray-100'}`}
          >
            <p className="text-sm font-semibold text-gray-900 truncate">{profile.name}</p>
            <p className="text-[11px] font-semibold text-gray-400 truncate mt-1">{profile.fileName}</p>
            <div className="flex flex-wrap gap-1 mt-3">
              {(profile.roles || []).slice(0, 2).map(role => (
                <span key={role} className="px-2 py-1 rounded-lg bg-gray-100 text-[9px] font-semibold uppercase tracking-wider text-gray-500">{role}</span>
              ))}
            </div>
          </button>
        ))}
        {!loading && profiles.length === 0 && (
          <div className="px-4 py-16 text-center text-xs font-bold text-gray-400">Chưa có CV nào.</div>
        )}
      </div>
    </aside>
  )
}
