import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAgentStore } from '../lib/AgentStore.jsx';
import { Sparkles, Download, Trash2, X, RefreshCw, Film, Upload, Power, PowerOff } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const SIZE_OPTIONS_WAN = [
  { label: 'Ngang 832×480', value: 'landscape' },
  { label: 'Dọc 480×832', value: 'portrait' },
  { label: 'Vuông 640×640', value: 'square' },
];

const SIZE_OPTIONS_AD = [
  { label: 'Vuông 512×512', value: 'square' },
  { label: 'Ngang 768×432', value: 'landscape' },
  { label: 'Dọc 432×768', value: 'portrait' },
];

const LENGTH_OPTIONS_WAN = [17, 25, 33, 49, 65, 81];
const LENGTH_OPTIONS_AD = [8, 16, 24, 32, 48];
const STEPS_OPTIONS_WAN = [10, 15, 20, 25];
const STEPS_OPTIONS_AD = [15, 20, 25, 30];

const MOTION_LORAS = [
  { label: 'Không', value: '' },
  { label: 'Zoom in', value: 'animatediff_motion_lora_zoom_in.safetensors' },
  { label: 'Zoom out', value: 'animatediff_motion_lora_zoom_out.safetensors' },
  { label: 'Pan left', value: 'animatediff_motion_lora_pan_left.safetensors' },
  { label: 'Pan right', value: 'animatediff_motion_lora_pan_right.safetensors' },
  { label: 'Tilt up', value: 'animatediff_motion_lora_tilt_up.safetensors' },
  { label: 'Tilt down', value: 'animatediff_motion_lora_tilt_down.safetensors' },
  { label: 'Rolling CW', value: 'animatediff_motion_lora_rolling_clockwise.safetensors' },
  { label: 'Rolling CCW', value: 'animatediff_motion_lora_rolling_anticlockwise.safetensors' },
];

function elapsed(ts) {
  if (!ts) return '';
  const sec = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m}m${sec % 60}s` : `${sec}s`;
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
  });
}

const HistoryCard = ({ item, onDelete, onClick }) => (
  <div
    className="relative group rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer bg-black"
    onClick={() => onClick?.(item)}
  >
    <video
      src={item.url}
      className="w-full h-44 object-cover"
      muted
      loop
      playsInline
      onMouseEnter={e => e.currentTarget.play().catch(() => {})}
      onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
    />
    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent" />
    <div className="absolute bottom-2 left-2 right-2 text-[11px] text-white/90 truncate">
      {formatTime(item.created_at)}
    </div>
    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 md:opacity-0 md:group-hover:opacity-100">
      <a
        href={item.url}
        download
        onClick={e => e.stopPropagation()}
        className="h-8 w-8 rounded-full bg-white/90 hover:bg-white text-gray-700 flex items-center justify-center shadow"
        title="Tải MP4"
      >
        <Download className="w-4 h-4" />
      </a>
      <button
        className="h-8 w-8 rounded-full bg-white/90 hover:bg-white text-red-500 flex items-center justify-center shadow"
        title="Xoá"
        onClick={e => { e.stopPropagation(); onDelete(item.name); }}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  </div>
);

export default function AnimateTab() {
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [engine, setEngine] = useState('wan'); // 'wan' | 'animatediff'
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  const [prompt, setPrompt] = useState('smooth cinematic motion, gentle camera move');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showNegative, setShowNegative] = useState(false);
  const [size, setSize] = useState('landscape');
  const [length, setLength] = useState(33);
  const [steps, setSteps] = useState(15);
  const [motionLora, setMotionLora] = useState('');
  const [denoise, setDenoise] = useState(0.9);
  const [loraStrength, setLoraStrength] = useState(1.0);

  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);

  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  // ComfyUI server status
  const [serverStatus, setServerStatus] = useState({ alive: false, vram: null });
  const [serverBusy, setServerBusy] = useState(false);
  const statusPollRef = useRef(null);

  const fetchServerStatus = useCallback(async () => {
    try {
      const r = await axios.get(`${API_BASE}/api/i2v/comfyui/status`);
      setServerStatus(r.data || { alive: false });
    } catch {
      setServerStatus({ alive: false });
    }
  }, []);

  useEffect(() => {
    fetchServerStatus();
    statusPollRef.current = setInterval(fetchServerStatus, 15000);
    return () => clearInterval(statusPollRef.current);
  }, [fetchServerStatus]);

  const startServer = async () => {
    setServerBusy(true);
    try {
      await axios.post(`${API_BASE}/api/i2v/comfyui/start`);
      // Poll faster for ~30s while it boots
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 2500));
        await fetchServerStatus();
        if (serverStatus.alive) break;
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Bật ComfyUI thất bại');
    } finally {
      setServerBusy(false);
      fetchServerStatus();
    }
  };

  const stopServer = async () => {
    if (!confirm('Tắt ComfyUI? Các job đang chạy sẽ bị huỷ.')) return;
    setServerBusy(true);
    try {
      await axios.post(`${API_BASE}/api/i2v/comfyui/stop`);
      await new Promise(r => setTimeout(r, 2000));
      await fetchServerStatus();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Tắt ComfyUI thất bại');
    } finally {
      setServerBusy(false);
    }
  };

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await axios.get(`${API_BASE}/api/i2v/history`, { params: { limit: 60 } });
      setHistory(r.data?.items || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // On mount: attach to any in-flight ComfyUI job + start polling
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await axios.post(`${API_BASE}/api/i2v/attach`);
        if (cancelled) return;
        const attached = a.data?.attached || [];
        if (attached.length === 0) return;
        const jobId = attached[0];
        setJob({ id: jobId, status: 'running', started_at: Date.now() / 1000, attached: true });
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          try {
            const rr = await axios.get(`${API_BASE}/api/i2v/jobs/${jobId}`);
            setJob(prev => ({ ...(prev || {}), ...rr.data }));
            if (rr.data.status === 'done' || rr.data.status === 'error') {
              clearInterval(pollRef.current);
              pollRef.current = null;
              if (rr.data.status === 'done') fetchHistory();
            }
          } catch {}
        }, 60000);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [fetchHistory]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // SSE-driven live update; thay polling 5s. Khi backend push agent.job,
  // re-sync local state + clear poll khi job xong.
  const { state: agentState } = useAgentStore();
  useEffect(() => {
    const id = job?.id;
    if (!id) return;
    const ev = agentState.activeJobs[id];
    if (!ev || ev.kind !== 'i2v') return;
    setJob(prev => ({ ...(prev || {}), ...ev }));
    if (ev.status === 'done' || ev.status === 'error') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (ev.status === 'done') fetchHistory();
    }
  }, [agentState.activeJobs, job?.id, fetchHistory]);

  useEffect(() => {
    const token = localStorage.getItem('hagent_token') || 'hat';
    axios.get(`${API_BASE}/api/comfyui/workflows`, {
      params: { category: 'video' },
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => setWorkflows(r.data?.workflows || [])).catch(() => {});
  }, []);

  // Sync default workflow when engine changes
  useEffect(() => {
    const defaultFile = engine === 'animatediff' ? 'animatediff_i2v.json' : 'wan_i2v.json';
    setSelectedWorkflow(defaultFile);
  }, [engine]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await axios.post(`${API_BASE}/api/i2v/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImageUrl(r.data.url);
      setImagePreview(r.data.url);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Upload thất bại');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleUrlChange = (e) => {
    const v = e.target.value.trim();
    setImageUrl(v);
    setImagePreview(v);
  };

  // Auto-adjust defaults when switching engine
  useEffect(() => {
    if (engine === 'animatediff') {
      setSize(s => (['square', 'landscape', 'portrait'].includes(s) ? s : 'square'));
      setLength(l => (LENGTH_OPTIONS_AD.includes(l) ? l : 16));
      setSteps(s => (STEPS_OPTIONS_AD.includes(s) ? s : 20));
    } else {
      setLength(l => (LENGTH_OPTIONS_WAN.includes(l) ? l : 33));
      setSteps(s => (STEPS_OPTIONS_WAN.includes(s) ? s : 15));
    }
  }, [engine]);

  const startJob = async () => {
    if (!imageUrl) {
      setError('Chưa có ảnh đầu vào');
      return;
    }
    setError('');
    try {
      const fullUrl = imageUrl.startsWith('http')
        ? imageUrl
        : `${window.location.origin}${imageUrl}`;
      const payload = {
        image_path: fullUrl,
        prompt,
        size,
        length: Number(length),
        steps: Number(steps),
        engine,
      };
      if (selectedWorkflow) payload.workflow = selectedWorkflow;
      if (negativePrompt.trim()) payload.negative = negativePrompt.trim();
      if (engine === 'animatediff') {
        payload.denoise = Number(denoise);
        if (motionLora) {
          payload.motion_lora = motionLora;
          payload.lora_strength = Number(loraStrength);
        }
      }
      const r = await axios.post(`${API_BASE}/api/i2v/jobs`, payload);
      const jobId = r.data.id;
      setJob({ id: jobId, status: 'queued', started_at: Date.now() / 1000, engine });
      // Safety-net poll giảm còn 60s (SSE drive live updates)
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const rr = await axios.get(`${API_BASE}/api/i2v/jobs/${jobId}`);
          setJob(prev => ({ ...(prev || {}), ...rr.data }));
          if (rr.data.status === 'done' || rr.data.status === 'error') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            if (rr.data.status === 'done') fetchHistory();
          }
        } catch {}
      }, 60000);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Tạo job thất bại');
    }
  };

  const cancelJob = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setJob(null);
  };

  const deleteHistory = async (name) => {
    try {
      await axios.delete(`${API_BASE}/api/i2v/history/${encodeURIComponent(name)}`);
      setHistory(prev => prev.filter(h => h.name !== name));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const isRunning = job && (job.status === 'queued' || job.status === 'running');
  const sizeOptions = engine === 'animatediff' ? SIZE_OPTIONS_AD : SIZE_OPTIONS_WAN;
  const lengthOptions = engine === 'animatediff' ? LENGTH_OPTIONS_AD : LENGTH_OPTIONS_WAN;
  const stepsOptions = engine === 'animatediff' ? STEPS_OPTIONS_AD : STEPS_OPTIONS_WAN;
  const fps = engine === 'animatediff' ? 8 : 16;
  const eta = engine === 'animatediff' ? Math.max(1, Math.round(steps * 0.08)) : Math.round(steps * 0.85);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 pt-3 pb-2 dark:border-gray-700 sm:px-4">
        <Film className="w-5 h-5 text-purple-500 shrink-0" />
        <span className="font-semibold text-gray-900 dark:text-gray-100">Tạo hoạt ảnh từ ảnh</span>
        <span className="hidden text-[10px] text-gray-400 sm:inline">{engine === 'animatediff' ? 'AnimateDiff SD1.5' : 'Wan 2.1 I2V'} · ~{eta} phút/job</span>
        {workflows.length > 0 && (
          <select
            value={selectedWorkflow}
            onChange={(e) => setSelectedWorkflow(e.target.value)}
            className="min-w-0 max-w-[140px] truncate rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 sm:max-w-none"
            title="ComfyUI workflow / preset dùng cho job này"
          >
            {workflows.map(w => (
              <option key={w.name} value={w.name}>
                {w.kind === 'preset' ? '✨' : '⚙'} {w.display || w.name}
              </option>
            ))}
          </select>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className={`flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-full ${serverStatus.alive ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${serverStatus.alive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            <span className="hidden sm:inline">ComfyUI </span>
            <span>{serverStatus.alive ? 'on' : 'off'}</span>
            {serverStatus.alive && serverStatus.vram && (
              <span className="hidden text-[10px] text-emerald-600/80 sm:inline">{serverStatus.vram.free_mb}/{serverStatus.vram.total_mb}MB</span>
            )}
          </span>
          {serverStatus.alive ? (
            <button onClick={stopServer} disabled={serverBusy}
              className="flex items-center gap-1 h-7 px-2.5 text-[11px] rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-300 disabled:opacity-50">
              <PowerOff className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{serverBusy ? '...' : 'Tắt'}</span>
            </button>
          ) : (
            <button onClick={startServer} disabled={serverBusy}
              className="flex items-center gap-1 h-7 px-2.5 text-[11px] rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-300 disabled:opacity-50">
              <Power className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{serverBusy ? 'Đang bật...' : 'Bật'}</span>
            </button>
          )}
          {history.length > 0 && (
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{history.length}</span>
          )}
        </div>
      </div>

      {error && (
        <div className="shrink-0 mx-4 mt-3 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
          <span className="break-all">{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 ml-2"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4 sm:px-4 sm:py-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
          <div className="space-y-2">
            <div
              className="relative aspect-video rounded-xl overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:border-purple-500 transition-colors group"
              onClick={handlePickFile}
            >
              {imagePreview ? (
                <img src={imagePreview} alt="" className="w-full h-full object-cover" onError={() => setImagePreview('')} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                  <Upload className="w-6 h-6 mb-1" />
                  <span className="text-xs font-medium">Chọn ảnh</span>
                  <span className="text-[10px] mt-0.5">JPG/PNG/WebP</span>
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <RefreshCw className="w-5 h-5 text-white animate-spin" />
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <input
              type="text"
              placeholder="hoặc dán URL ảnh"
              value={imageUrl.startsWith('/') ? '' : imageUrl}
              onChange={handleUrlChange}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>

          <div className="space-y-3">
            <div>
              <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Engine</label>
              <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
                <button onClick={() => setEngine('wan')} disabled={isRunning}
                  title="Wan 2.1 (chậm, sắc nét)"
                  className={`flex-1 truncate rounded px-2 py-1.5 text-[11px] font-medium transition-all sm:px-3 sm:text-xs ${engine === 'wan' ? 'bg-white dark:bg-gray-700 text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                  <span className="sm:hidden">Wan 2.1</span>
                  <span className="hidden sm:inline">Wan 2.1 (chậm, sắc nét)</span>
                </button>
                <button onClick={() => setEngine('animatediff')} disabled={isRunning}
                  title="AnimateDiff (nhanh)"
                  className={`flex-1 truncate rounded px-2 py-1.5 text-[11px] font-medium transition-all sm:px-3 sm:text-xs ${engine === 'animatediff' ? 'bg-white dark:bg-gray-700 text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                  <span className="sm:hidden">AnimDiff</span>
                  <span className="hidden sm:inline">AnimateDiff (nhanh)</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Mô tả chuyển động (EN tốt hơn)</label>
              <textarea
                rows={3}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                disabled={isRunning}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-purple-500 outline-none resize-none disabled:opacity-50"
              />
            </div>

            <div>
              <button type="button" onClick={() => setShowNegative(v => !v)}
                className="text-[11px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
                {showNegative ? '▲' : '▼'} Negative prompt {negativePrompt && <span className="text-purple-500">·</span>}
              </button>
              {showNegative && (
                <textarea rows={2} value={negativePrompt} onChange={e => setNegativePrompt(e.target.value)}
                  disabled={isRunning}
                  placeholder="static, blurry, low quality, distorted (EN)"
                  className="mt-1 w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-purple-500 outline-none resize-none disabled:opacity-50" />
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Tỉ lệ</label>
                <select value={size} onChange={e => setSize(e.target.value)} disabled={isRunning}
                  className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 disabled:opacity-50">
                  {sizeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Frames</label>
                <select value={length} onChange={e => setLength(Number(e.target.value))} disabled={isRunning}
                  className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 disabled:opacity-50">
                  {lengthOptions.map(n => <option key={n} value={n}>{n} (~{Math.round(n / fps * 10) / 10}s)</option>)}
                </select>
              </div>
              <div>
                <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Steps</label>
                <select value={steps} onChange={e => setSteps(Number(e.target.value))} disabled={isRunning}
                  className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 disabled:opacity-50">
                  {stepsOptions.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            {engine === 'animatediff' && (
              <>
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Motion LoRA</label>
                  <select value={motionLora} onChange={e => setMotionLora(e.target.value)} disabled={isRunning}
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 disabled:opacity-50">
                    {MOTION_LORAS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="flex items-center justify-between mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                      <span>Denoise</span>
                      <span className="font-mono text-purple-600">{denoise.toFixed(2)}</span>
                    </label>
                    <input type="range" min="0.5" max="1" step="0.05" value={denoise}
                      onChange={e => setDenoise(Number(e.target.value))} disabled={isRunning}
                      className="w-full accent-purple-500" />
                    <p className="text-[10px] text-gray-400 mt-0.5">≥0.85 mới có chuyển động thật</p>
                  </div>
                  {motionLora && (
                    <div>
                      <label className="flex items-center justify-between mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                        <span>LoRA strength</span>
                        <span className="font-mono text-purple-600">{loraStrength.toFixed(2)}</span>
                      </label>
                      <input type="range" min="0.3" max="1.5" step="0.05" value={loraStrength}
                        onChange={e => setLoraStrength(Number(e.target.value))} disabled={isRunning}
                        className="w-full accent-purple-500" />
                      <p className="text-[10px] text-gray-400 mt-0.5">Tăng để chuyển động rõ hơn</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {!isRunning ? (
              <button
                onClick={startJob}
                disabled={!imageUrl || uploading}
                className="w-full px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {job?.status === 'done' ? 'Tạo lại' : 'Tạo hoạt ảnh'}
              </button>
            ) : (
              <div className="px-3 py-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-purple-600 animate-spin" />
                <span className="text-sm text-purple-700 dark:text-purple-300 flex-1">
                  {job.status === 'queued' ? 'Đang xếp hàng...' : 'Đang render trên GPU...'}
                </span>
                <span className="text-xs font-mono text-purple-500">{elapsed(job.started_at)}</span>
                <button onClick={cancelJob} className="text-xs text-purple-600 hover:text-purple-800">Ẩn</button>
              </div>
            )}

            {job?.status === 'error' && (
              <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs break-all">
                Lỗi: {job.error}
              </div>
            )}

            {job?.status === 'done' && job.result?.video_url && (
              <div className="space-y-2">
                <video src={job.result.video_url} controls autoPlay loop
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-black" />
                <div className="flex gap-2">
                  <a href={job.result.video_url} download
                    className="flex-1 px-3 py-1.5 rounded bg-gray-900 hover:bg-black text-white text-center text-xs font-medium">
                    📥 Tải MP4
                  </a>
                  <button onClick={() => setJob(null)}
                    className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-medium">
                    Tạo mới
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Film className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Lịch sử video</span>
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">{history.length}</span>
            <button onClick={fetchHistory} className="ml-auto h-7 px-2 text-xs rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1">
              <RefreshCw className={`w-3 h-3 ${historyLoading ? 'animate-spin' : ''}`} /> Làm mới
            </button>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
              <Film className="w-8 h-8 mb-2" />
              <p className="text-sm">Chưa có video</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {history.map(item => (
                <HistoryCard key={item.name} item={item} onDelete={deleteHistory} onClick={setPreviewItem} />
              ))}
            </div>
          )}
        </div>
      </div>

      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewItem(null)}>
          <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewItem(null)} className="absolute -top-10 right-0 text-white/80 hover:text-white">
              <X className="w-6 h-6" />
            </button>
            <video src={previewItem.url} controls autoPlay loop className="w-full rounded-xl bg-black" />
            <div className="mt-2 text-xs text-white/60 flex justify-between">
              <span>{previewItem.name}</span>
              <span>{formatTime(previewItem.created_at)} · {(previewItem.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
