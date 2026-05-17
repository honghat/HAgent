import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

export default function VideoPage({ token: tokenProp }) {
  const token = tokenProp || localStorage.getItem('token');
  const [view, setView] = useState('list');
  const [activeTaskId, setActiveTaskId] = useState(null);

  const api = useCallback(() => {
    const inst = axios.create();
    if (token) inst.defaults.headers.common.Authorization = `Bearer ${token}`;
    return inst;
  }, [token]);

  return (
    <div className="h-full bg-gray-50 flex flex-col p-3 md:p-5 overflow-y-auto pb-safe">
      <div className="max-w-6xl mx-auto w-full">
        {/* Internal Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-4">
          <div className="space-y-1">
            <h1 className="text-base font-semibold text-gray-900 tracking-tight">Video AI</h1>
            <p className="text-[12px] text-gray-400 font-medium">Tự động dịch và lồng tiếng video</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar">
            <nav className="bg-gray-100 p-1 rounded-md flex gap-1 shrink-0">
              <button 
                onClick={() => setView('list')}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold transition-all ${view === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Lịch sử
              </button>
              <button 
                onClick={() => setView('new')}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold transition-all ${view === 'new' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Dịch mới
              </button>
            </nav>
            <a 
              href={`/api/video/auth/youtube/login?t=${token}`} 
              target="_blank" 
              rel="noreferrer"
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-[11px] font-semibold transition-all active:scale-95 flex items-center gap-2 shrink-0"
            >
              YouTube
            </a>
          </div>
        </div>

        <main className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {view === 'list' && <TaskList api={api} onNew={() => setView('new')} onOpen={(id) => { setActiveTaskId(id); setView('detail'); }} />}
          {view === 'new' && <NewTask api={api} onCreated={(id) => { setActiveTaskId(id); setView('detail'); }} onCancel={() => setView('list')} />}
          {view === 'detail' && <TaskDetail api={api} token={token} taskId={activeTaskId} onBack={() => setView('list')} />}
        </main>
      </div>
    </div>
  );
}

// ========== Task List ==========
function TaskList({ api, onNew, onOpen }) {
  const [tasks, setTasks] = useState([]);

  const refresh = useCallback(async () => {
    try { const r = await api().get('/api/video/tasks'); setTasks(r.data.tasks); } catch {}
  }, [api]);

  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [refresh]);

  const remove = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Xóa video này?')) return;
    await api().delete(`/api/video/tasks/${id}`);
    refresh();
  };

  const statusColor = (s) => {
    const m = { 
      queued: 'bg-amber-50 text-amber-600 border-amber-100', 
      running: 'bg-blue-50 text-blue-600 border-blue-100', 
      done: 'bg-emerald-50 text-emerald-600 border-emerald-100', 
      error: 'bg-red-50 text-red-600 border-red-100' 
    };
    return m[s] || 'bg-gray-50 text-gray-600 border-gray-100';
  };

  const statusLabel = (s) => ({ queued: 'ĐANG CHỜ', running: 'ĐANG CHẠY', done: 'HOÀN TẤT', error: 'LỖI' }[s] || s.toUpperCase());

  return (
    <div>
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 bg-white border border-dashed border-gray-200 rounded-lg px-4 text-center">
          <div className="w-14 h-14 bg-gray-50 rounded-lg flex items-center justify-center mb-4 text-gray-200">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </div>
          <p className="text-gray-400 font-semibold text-[13px]">Chưa có video nào</p>
          <button onClick={onNew} className="mt-5 text-indigo-600 font-semibold text-sm hover:underline decoration-2 underline-offset-4 transition-all">Bắt đầu dịch ngay</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasks.map(t => (
            <div key={t.id} onClick={() => onOpen(t.id)} className="group relative bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-all cursor-pointer">
              <div className="flex flex-col h-full">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 tracking-tight truncate text-sm flex-1">{t.title}</h3>
                  <button onClick={e => remove(t.id, e)} className="p-1.5 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-md transition-all ml-2 shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-1.5 mb-4">
                   <span className={`text-[9px] font-semibold border px-1.5 py-0.5 rounded ${statusColor(t.status)}`}>{statusLabel(t.status)}</span>
                   <span className="text-[9px] font-semibold text-indigo-500 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100/30">
                     {t.source_type === 'youtube' ? 'YouTube' : t.source_type === 'bilibili' ? 'Bilibili' : 'Upload'}
                   </span>
                </div>

                <div className="mt-auto pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-gray-400">
                  <div className="flex items-center gap-3">
                    {t.duration && <span>⏱ {Math.floor(t.duration / 60)}:{String(Math.floor(t.duration % 60)).padStart(2, '0')}</span>}
                    {t.segments_count > 0 && <span>💬 {t.segments_count} câu</span>}
                  </div>
                  <span>{new Date(t.created_at).toLocaleDateString('vi-VN')}</span>
                </div>
                {t.error && <p className="mt-3 text-[10px] text-red-500 font-bold bg-red-50 p-2 rounded-md line-clamp-2">{t.error}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== New Task ==========
function NewTask({ api, onCreated, onCancel }) {
  const [tab, setTab] = useState('url');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [voice, setVoice] = useState('namminh');
  const [busy, setBusy] = useState(false);
  const [fetchingTitle, setFetchingTitle] = useState(false);
  const ytRef = useRef(null);

  const onUrlChange = (val) => {
    setUrl(val);
    clearTimeout(ytRef.current);
    ytRef.current = setTimeout(async () => {
      if (!val.trim()) return;
      setFetchingTitle(true);
      try {
        const r = await api().get('/api/video/tasks/yt/info', { params: { url: val.trim() } });
        if (r.data.title) setTitle(r.data.title);
      } catch {}
      setFetchingTitle(false);
    }, 800);
  };

  const submit = async () => {
    setBusy(true);
    try {
      let r;
      if (tab === 'upload') {
        if (!file) { alert('Chọn file'); setBusy(false); return; }
        const fd = new FormData();
        fd.append('video', file);
        fd.append('voice', voice);
        r = await api().post('/api/video/tasks/upload', fd);
      } else {
        if (!url) { alert('Nhập URL'); setBusy(false); return; }
        r = await api().post('/api/video/tasks/url', { url, title: title || url, voice });
      }
      onCreated(r.data.id);
    } catch (e) { alert(e.response?.data?.error || e.message); }
    setBusy(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-md mb-4">
          <button onClick={() => setTab('url')} className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition-all ${tab === 'url' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>Link video</button>
          <button onClick={() => setTab('upload')} className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition-all ${tab === 'upload' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>Upload file</button>
        </div>

        <div className="space-y-4">
          {tab === 'url' ? (
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-gray-400 ml-1">Video URL (YT/Bili/Douyin)</label>
              <input type="url" value={url} onChange={e => onUrlChange(e.target.value)} placeholder="Nhập đường dẫn video..." 
                className="w-full bg-gray-50 border border-gray-200 focus:border-gray-400 rounded-md px-3 py-2 text-sm outline-none transition-all font-medium text-gray-700" />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-gray-400 ml-1">File Video (MP4)</label>
              <div className="relative group cursor-pointer">
                <input type="file" accept="video/*" onChange={e => setFile(e.target.files?.[0] || null)}
                  className="w-full bg-gray-50 border border-dashed border-gray-200 group-hover:border-gray-400 rounded-md px-4 py-6 text-sm outline-none transition-all text-gray-400 text-center" />
                {file && <p className="mt-2 text-center text-xs font-bold text-emerald-600">{file.name}</p>}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-gray-400 ml-1">Tiêu đề {fetchingTitle && '...'}</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Tên video..."
              className="w-full bg-gray-50 border border-gray-200 focus:border-gray-400 rounded-md px-3 py-2 text-sm outline-none transition-all font-medium text-gray-700" />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-gray-400 ml-1">Giọng lồng tiếng</label>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setVoice('namminh')} className={`py-2 rounded-md text-[12px] font-semibold border transition-all ${voice === 'namminh' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>Nam Minh</button>
              <button onClick={() => setVoice('hoaimy')} className={`py-2 rounded-md text-[12px] font-semibold border transition-all ${voice === 'hoaimy' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>Hoài My</button>
            </div>
          </div>

          <button onClick={submit} disabled={busy || (!url && !file)}
            className="w-full bg-gray-900 text-white py-2.5 rounded-md text-sm font-semibold hover:bg-black transition-all active:scale-[0.98] disabled:opacity-50 mt-2">
            {busy ? 'Đang chuẩn bị...' : 'Bắt đầu lồng tiếng'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== Task Detail ==========
function TaskDetail({ api, token, taskId, onBack }) {
  const [task, setTask] = useState(null);
  const [logs, setLogs] = useState([]);
  const [publishStatus, setPublishStatus] = useState({});
  const logEnd = useRef(null);
  const videoRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api().get(`/api/video/tasks/${taskId}`);
      setTask(r.data);
      const history = (r.data.logs || []).map(e => ({ ts: e.t, text: e.m }));
      setLogs(history);
    } catch {}
  }, [api, taskId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!task || task.status === 'done' || task.status === 'error') return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [task?.status, refresh]);

  useEffect(() => {
    const es = new EventSource(`/api/video/tasks/${taskId}/progress?t=${encodeURIComponent(token)}`);
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.message === 'connected') return;
        if (d.done) { es.close(); return; }
        setLogs(prev => [...prev.slice(-300), { ts: Date.now(), text: d.message }]);
      } catch {}
    };
    return () => es.close();
  }, [taskId, token]);

  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const retry = async () => {
    if (task?.status === 'running') { if (!confirm('Task đang chạy. Dừng và chạy lại?')) return; }
    setLogs([]);
    await api().post(`/api/video/tasks/${taskId}/retry`);
    refresh();
  };

  const publish = async (platform) => {
    setPublishStatus(prev => ({ ...prev, [platform]: 'publishing' }));
    try {
      const r = await api().post(`/api/video/publish/${taskId}`, { platform });
      setPublishStatus(prev => ({ ...prev, [platform]: 'Thành công: ' + r.data.url }));
    } catch (e) {
      setPublishStatus(prev => ({ ...prev, [platform]: 'Lỗi: ' + (e.response?.data?.error || e.message) }));
    }
  };

  if (!task) return <div className="py-20 text-center text-gray-400 font-semibold text-sm animate-pulse">Đang tải thông tin...</div>;

  const videoSrc = task.video_file ? `/uploads/${task.video_file}` : null;
  const srtSrc = task.srt_file ? `/uploads/${task.srt_file}` : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 rounded-md transition-all active:scale-95 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
        </button>
        <h2 className="text-sm font-semibold text-gray-900 tracking-tight truncate">{task.title}</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {task.status === 'done' && videoSrc ? (
            <div className="bg-black rounded-lg overflow-hidden border border-gray-200" ref={videoRef}>
              <video src={videoSrc} controls playsInline className="w-full h-auto aspect-video" />
              <div className="bg-white p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <a href={videoSrc} download className="bg-gray-900 text-white px-3 py-2 rounded-md text-[11px] font-semibold hover:bg-black transition-all">Tải MP4</a>
                  {srtSrc && <a href={srtSrc} download className="bg-gray-50 text-gray-500 px-3 py-2 rounded-md text-[11px] font-semibold hover:bg-gray-100 transition-all border border-gray-200">Tải SRT</a>}
                </div>
                <button onClick={retry} className="text-gray-400 hover:text-gray-900 text-[11px] font-semibold transition-all">Làm lại</button>
              </div>
            </div>
          ) : (
            <div className="aspect-video bg-white border border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center space-y-3 px-4 text-center">
              <div className="relative">
                 <div className="w-12 h-12 border-4 border-gray-100 border-t-indigo-500 rounded-full animate-spin"></div>
                 {task.status === 'running' && <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-indigo-500">RUN</div>}
              </div>
              <p className="text-gray-400 font-semibold text-[12px]">
                {task.status === 'queued' ? 'Đang chờ xử lý...' : 'Hệ thống đang làm việc...'}
              </p>
              {task.status === 'error' && (
                <button onClick={retry} className="mt-2 bg-gray-900 text-white px-4 py-2 rounded-md text-[11px] font-semibold hover:bg-black transition-all active:scale-95">Làm lại</button>
              )}
            </div>
          )}

          {task.status === 'done' && (
             <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-[11px] font-semibold text-gray-400 mb-3">Đăng lên nền tảng</h4>
                <div className="flex gap-2">
                   <button onClick={() => publish('youtube')} disabled={publishStatus.youtube === 'publishing'}
                     className="bg-red-600 text-white px-4 py-2 rounded-md text-[11px] font-semibold hover:bg-red-700 transition-all flex items-center gap-2">
                     {publishStatus.youtube === 'publishing' ? '...' : 'YouTube'}
                   </button>
                </div>
                {Object.entries(publishStatus).map(([k, v]) => (
                  v && v !== 'publishing' && <div key={k} className="mt-3 p-2 bg-gray-50 rounded-md text-[10px] font-bold text-gray-500 border border-gray-200 truncate">{k.toUpperCase()}: {v}</div>
                ))}
                
                <div className="mt-4">
                  <details className="group">
                    <summary className="list-none cursor-pointer flex items-center justify-between text-[11px] font-semibold text-gray-400">
                      <span>Mô tả video tự động</span>
                      <svg className="w-4 h-4 group-open:rotate-180 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" /></svg>
                    </summary>
                    <div className="mt-3">
                       <DescEditor task={task} />
                    </div>
                  </details>
                </div>
             </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[11px] font-semibold text-gray-400">Tiến trình</h4>
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
            </div>
            <div className="space-y-2 max-h-72 sm:h-[360px] overflow-y-auto pr-2 custom-scrollbar text-[11px] leading-relaxed">
              {logs.length === 0 && <p className="text-gray-300 font-medium italic">Đang chờ tín hiệu...</p>}
              {logs.map((l, i) => (
                <div key={i} className="flex gap-3 py-1 group">
                  <span className="text-gray-300 font-bold shrink-0">{new Date(l.ts).toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-gray-600 font-medium group-last:text-indigo-600 group-last:font-semibold">{l.text}</span>
                </div>
              ))}
              <div ref={logEnd} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DescEditor({ task }) {
  const desc = task.yt_desc || '';
  const tags = (task.yt_tags || '').split(/[,;\s]+/).filter(Boolean).map(t => `#${t}`).join(' ');
  const fullText = tags ? `${desc}\n\n${tags}` : desc;
  const textRef = useRef(null);

  const copy = () => {
    if (!textRef.current) return;
    navigator.clipboard.writeText(textRef.current.value).catch(() => {});
  };

  if (!fullText) return <p className="text-[11px] text-gray-400 font-medium italic">Không có mô tả nào được tạo.</p>;

  return (
    <div className="relative group">
      <textarea
        ref={textRef}
        readOnly
        value={fullText}
        className="w-full bg-gray-50 border border-gray-200 rounded-md p-3 text-[11px] font-medium text-gray-600 leading-relaxed min-h-[120px] outline-none"
      />
      <button
        onClick={copy}
        className="absolute top-2 right-2 bg-white border border-gray-200 text-[10px] font-semibold px-2 py-1 rounded-md hover:bg-gray-50 transition-all"
      >
        Copy
      </button>
    </div>
  );
}
