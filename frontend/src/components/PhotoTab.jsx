import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Sparkles, Download, Trash2, X, RefreshCw, ChevronDown, ChevronUp, ImageIcon, Film, Power, PowerOff } from 'lucide-react';
import { useAgentStore } from '../lib/AgentStore.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const ASPECT_OPTIONS = [
  { label: '16:9 ngang', value: 'landscape' },
  { label: '16:9 dọc', value: 'portrait' },
  { label: '1:1', value: 'square' }
];

const PlaceholderIcon = () => (
  <div className="flex items-center justify-center h-full w-full bg-gray-100 dark:bg-gray-800">
    <ImageIcon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
  </div>
);

const HistoryCard = ({ item, onDelete, onClick, onAnimate }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(item.id);
  };

  const handleAnimate = (e) => {
    e.stopPropagation();
    onAnimate?.(item);
  };

  const imgUrl = item.image_url || item.thumbnail_url || '';

  return (
    <div
      className="relative group rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer bg-gray-100 dark:bg-gray-800"
      onClick={() => onClick?.(item)}
    >
      <div className="relative h-52 w-full overflow-hidden">
        {!imgLoaded && !imgError && <PlaceholderIcon />}

        {imgUrl && (
          <img
            src={imgUrl}
            alt={item.prompt || 'Generated image'}
            className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        )}

        {imgError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <div className="text-center">
              <ImageIcon className="w-6 h-6 mx-auto text-gray-400 dark:text-gray-500 mb-1" />
              <p className="text-xs text-gray-400">Lỗi</p>
            </div>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <span className="text-xs text-white/90 truncate">
            {item.created_at
              ? new Date(item.created_at).toLocaleDateString('vi-VN', { hour: '2-digit', minute: '2-digit' })
              : ''}
          </span>
        </div>
      </div>

      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center gap-2 md:opacity-0 md:group-hover:opacity-100">
        <button
          className="h-8 w-8 rounded-full bg-white/90 hover:bg-white text-gray-700 flex items-center justify-center transition-colors shadow"
          title="Xem"
          onClick={(e) => { e.stopPropagation(); onClick?.(item); }}
        >
          <ImageIcon className="w-4 h-4" />
        </button>
        <button
          className="h-8 w-8 rounded-full bg-white/90 hover:bg-white text-purple-600 flex items-center justify-center transition-colors shadow"
          title="Tạo hoạt ảnh"
          onClick={handleAnimate}
        >
          <Film className="w-4 h-4" />
        </button>
        <button
          className="h-8 w-8 rounded-full bg-white/90 hover:bg-white text-red-500 flex items-center justify-center transition-colors shadow"
          title="Xóa"
          onClick={handleDelete}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const PhotoTab = ({ provider }) => {
  const [activeTab, setActiveTab] = useState('comfyui'); // 'comfyui' | 'chatgpt'
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showNegative, setShowNegative] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('landscape');
  const [count, setCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [resultUrls, setResultUrls] = useState([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [clearingHistory, setClearingHistory] = useState(false);
  const [clearingRemote, setClearingRemote] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [showAccounts, setShowAccounts] = useState(false);
  const [batchTokens, setBatchTokens] = useState('');
  const [importingBatch, setImportingBatch] = useState(false);

  // I2V (animate from image)
  const [animateItem, setAnimateItem] = useState(null);
  const [animateEngine, setAnimateEngine] = useState('wan'); // 'wan' | 'animatediff'
  const [animatePrompt, setAnimatePrompt] = useState('smooth cinematic motion, gentle camera move');
  const [animateSize, setAnimateSize] = useState('landscape');
  const [animateLength, setAnimateLength] = useState(33);
  const [animateSteps, setAnimateSteps] = useState(15);
  const [animateMotionLora, setAnimateMotionLora] = useState('');
  const [animateNegative, setAnimateNegative] = useState('');
  const [animateShowNegative, setAnimateShowNegative] = useState(false);
  const [animateJob, setAnimateJob] = useState(null);
  const animatePollRef = useRef(null);

  // ComfyUI server status (shared with AnimateTab)
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
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 2500));
        await fetchServerStatus();
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Bật ComfyUI thất bại');
    } finally {
      setServerBusy(false);
      fetchServerStatus();
    }
  };

  const stopServer = async () => {
    if (!confirm('Tắt ComfyUI?')) return;
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

  const isGptId = (id) => /^(gpt-|codex-|auto$)/i.test(String(id || ''));
  const preferredChatGptModelId = 'gpt-image-2-medium';
  const findPreferredChatGptModel = (list) => {
    return (Array.isArray(list) ? list : []).find(m => {
      const id = String(m?.id || '').toLowerCase();
      return id === preferredChatGptModelId || /chatgpt\s*2\s*medium/i.test(id) || /gpt-image-2-medium/i.test(id);
    })?.id;
  };
  const tabModels = models.filter(m =>
    activeTab === 'chatgpt' ? isGptId(m.id) : !isGptId(m.id)
  );

  const totalQuota = accounts.reduce((s, a) => s + (Number(a.quota_remaining) || 0), 0);
  const activeCount = accounts.filter(a => a.is_active).length;

  const fetchModels = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/photo/models`);
      const list = Array.isArray(res.data) ? res.data : [];
      setModels(list);
      const preferredId = findPreferredChatGptModel(list);
      if (!selectedModel && preferredId) {
        setSelectedModel(preferredId);
      } else if (!selectedModel && list[0]?.id) {
        setSelectedModel(list[0].id);
      }
    } catch {}
  }, [selectedModel]);

  const fetchWorkflows = useCallback(async () => {
    try {
      const token = localStorage.getItem('hagent_token') || 'hat';
      const res = await axios.get(`${API_BASE}/api/comfyui/workflows`, {
        params: { category: 'photo' },
        headers: { Authorization: `Bearer ${token}` },
      });
      setWorkflows(res.data?.workflows || []);
    } catch {}
  }, []);

  useEffect(() => { fetchWorkflows(); }, [fetchWorkflows]);

  // Sync selected workflow with model's default; user can override
  useEffect(() => {
    const m = models.find(x => x.id === selectedModel);
    if (m?.workflow_file) setSelectedWorkflow(m.workflow_file);
  }, [selectedModel, models]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/photo/accounts`);
      setAccounts(Array.isArray(res.data) ? res.data : []);
    } catch {}
  }, []);

  const handleImportBatch = async () => {
    const lines = batchTokens.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setImportingBatch(true);
    try {
      const tokens = lines.map(line => {
        const [access_token, email_hint = ''] = line.split(/\s*[|,]\s*/);
        return { access_token, email_hint };
      });
      await axios.post(`${API_BASE}/api/photo/import-batch`, { tokens });
      setBatchTokens('');
      await fetchAccounts();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Import thất bại');
    } finally {
      setImportingBatch(false);
    }
  };

  const handleRemoveAccount = async (token_prefix) => {
    try {
      const trimmed = String(token_prefix || '').replace(/\.{3}$/, '');
      await axios.delete(`${API_BASE}/api/photo/accounts/${encodeURIComponent(trimmed)}`);
      await fetchAccounts();
    } catch {}
  };

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/photo/history`, { params: { limit: 50 } });
      const items = Array.isArray(res.data) ? res.data : (res.data.history || res.data.items || []);
      // Map backend fields → frontend fields
      setHistory(items.map(item => ({
        id: item.name || item.id,
        image_url: item.name ? `${API_BASE}/api/photo/file/${item.name}` : (item.image_url || ''),
        prompt: item.prompt || '',
        created_at: item.created_at ? new Date(item.created_at * 1000).toISOString() : null,
      })));
    } catch (err) {
      console.error('Failed to fetch history:', err);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); fetchModels(); fetchAccounts(); }, [fetchHistory, fetchModels, fetchAccounts]);

  // Khi đổi tab, đảm bảo selectedModel thuộc tab hiện tại
  useEffect(() => {
    if (!models.length) return;
    const inTab = tabModels.find(m => m.id === selectedModel);
    if (!inTab && tabModels[0]?.id) {
      if (activeTab === 'chatgpt') {
        const preferredId = findPreferredChatGptModel(tabModels);
        setSelectedModel(preferredId || tabModels[0].id);
      } else {
        setSelectedModel(tabModels[0].id);
      }
    }
  }, [activeTab, models, selectedModel, tabModels]);

  const generateJobIdKey = 'hagent_photo_job_id';
  const generatePollRef = useRef(null);
  const [generateJob, setGenerateJob] = useState(null);

  const toFileUrl = (raw) => {
    if (!raw) return '';
    const fn = String(raw).split('/').pop();
    return `${API_BASE}/api/photo/file/${fn}`;
  };

  const stopGeneratePolling = () => {
    if (generatePollRef.current) {
      clearInterval(generatePollRef.current);
      generatePollRef.current = null;
    }
  };

  const handleJobUpdate = useCallback((data) => {
    setGenerateJob(data);
    const partial = (data.partial_images || []).map(toFileUrl);
    if (partial.length) setResultUrls(partial);
    if (data.status === 'done') {
      const finals = (data.result?.images || []).map(toFileUrl);
      if (finals.length) setResultUrls(finals);
      stopGeneratePolling();
      setGenerating(false);
      localStorage.removeItem(generateJobIdKey);
      fetchHistory();
    } else if (data.status === 'error') {
      stopGeneratePolling();
      setGenerating(false);
      setError(data.error || 'Tạo ảnh thất bại');
      localStorage.removeItem(generateJobIdKey);
    }
  }, [fetchHistory]);

  // SSE-driven: thay cho setInterval polling. Giữ 1 safety-net poll 30s phòng SSE drop.
  const startPolling = useCallback((jobId) => {
    stopGeneratePolling();
    generatePollRef.current = setInterval(async () => {
      try {
        const r = await axios.get(`${API_BASE}/api/photo/jobs/${jobId}`);
        handleJobUpdate(r.data);
      } catch (err) {
        if (err.response?.status === 404) {
          stopGeneratePolling();
          setGenerating(false);
          localStorage.removeItem(generateJobIdKey);
        }
      }
    }, 30000);
  }, [handleJobUpdate]);

  // SSE subscription: re-sync khi backend push agent.job
  const { state: agentState } = useAgentStore();
  useEffect(() => {
    const id = generateJob?.id;
    if (!id) return;
    const ev = agentState.activeJobs[id];
    if (ev && ev.kind === 'photo') handleJobUpdate(ev);
  }, [agentState.activeJobs, generateJob?.id, handleJobUpdate]);

  // Resume polling on mount if a job is still in flight (F5/network drop)
  useEffect(() => {
    const saved = localStorage.getItem(generateJobIdKey);
    if (!saved) return;
    (async () => {
      try {
        const r = await axios.get(`${API_BASE}/api/photo/jobs/${saved}`);
        if (r.data.status === 'queued' || r.data.status === 'running') {
          setGenerating(true);
          handleJobUpdate(r.data);
          startPolling(saved);
        } else {
          handleJobUpdate(r.data);
        }
      } catch {
        localStorage.removeItem(generateJobIdKey);
      }
    })();
    return () => stopGeneratePolling();
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError('');
    setResultUrls([]);
    try {
      const res = await axios.post(`${API_BASE}/api/photo/jobs`, {
        prompt: prompt.trim(),
        negative: negativePrompt.trim(),
        aspect_ratio: aspectRatio,
        count: count,
        model: selectedModel || undefined,
        workflow: selectedWorkflow || undefined,
      });
      const jobId = res.data.id;
      localStorage.setItem(generateJobIdKey, jobId);
      setGenerateJob({ id: jobId, status: 'queued', progress: { done: 0, total: count } });
      startPolling(jobId);
    } catch (err) {
      setGenerating(false);
      setError(err.response?.data?.detail || err.message || 'Tạo job thất bại');
    }
  };

  const cancelGenerate = () => {
    stopGeneratePolling();
    setGenerating(false);
    localStorage.removeItem(generateJobIdKey);
    setGenerateJob(null);
  };

  const handleDelete = async (id) => {
    setDeletingIds(prev => new Set(prev).add(id));
    try {
      // Xóa cache local trước
      await axios.delete(`${API_BASE}/api/photo/delete/${id}`);
      // Sau đó xóa trên máy remote (Hat-Linux)
      await axios.delete(`${API_BASE}/api/photo/remote/${id}`);
      setHistory(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      // Nếu lỗi remote nhưng local xóa thành công — vẫn xóa khỏi UI
      if (err.response?.status === 404) {
        // File không tồn tại ở remote — vẫn xóa khỏi UI
        setHistory(prev => prev.filter(h => h.id !== id));
      } else {
        console.error('Delete failed:', err);
      }
    } finally {
      setDeletingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const handleClearHistory = async () => {
    setClearingHistory(true);
    try {
      await axios.post(`${API_BASE}/api/photo/clear-history`);
      setHistory([]);
    } catch (err) {
      console.error('Clear history failed:', err);
    } finally {
      setClearingHistory(false);
    }
  };

  const handleClearRemote = async () => {
    const ok = window.confirm('Xoá tất cả ảnh trên máy remote ComfyUI?');
    if (!ok) return;
    setClearingRemote(true);
    try {
      const res = await axios.post(`${API_BASE}/api/photo/remote/clear-all`);
      alert(`Đã xoá ${res.data.deleted_count} ảnh trên máy remote.`);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi không xác định';
      alert(`Xoá remote thất bại: ${msg}`);
    } finally {
      setClearingRemote(false);
    }
  };

  const openAnimate = (item) => {
    setAnimateItem(item);
    setAnimateJob(null);
    setAnimateEngine('wan');
    setAnimatePrompt('smooth cinematic motion, gentle camera move');
    setAnimateSize('landscape');
    setAnimateLength(33);
    setAnimateSteps(15);
    setAnimateMotionLora('');
    setAnimateNegative('');
    setAnimateShowNegative(false);
  };

  const closeAnimate = () => {
    if (animatePollRef.current) {
      clearInterval(animatePollRef.current);
      animatePollRef.current = null;
    }
    setAnimateItem(null);
    setAnimateJob(null);
  };

  // Auto-adjust defaults when engine changes
  useEffect(() => {
    if (animateEngine === 'animatediff') {
      setAnimateSize(s => (['square', 'landscape', 'portrait'].includes(s) ? s : 'square'));
      setAnimateLength(l => ([8, 16, 24, 32, 48].includes(l) ? l : 16));
      setAnimateSteps(s => ([15, 20, 25, 30].includes(s) ? s : 20));
    } else {
      setAnimateLength(l => ([17, 25, 33, 49, 65, 81].includes(l) ? l : 33));
      setAnimateSteps(s => ([10, 15, 20, 25].includes(s) ? s : 15));
    }
  }, [animateEngine]);

  const startAnimate = async () => {
    if (!animateItem?.image_url) return;
    try {
      const imageUrl = animateItem.image_url.startsWith('http')
        ? animateItem.image_url
        : `${window.location.origin}${animateItem.image_url}`;
      const payload = {
        image_path: imageUrl,
        prompt: animatePrompt,
        size: animateSize,
        length: Number(animateLength),
        steps: Number(animateSteps),
        engine: animateEngine,
      };
      if (animateNegative.trim()) payload.negative = animateNegative.trim();
      if (animateEngine === 'animatediff' && animateMotionLora) {
        payload.motion_lora = animateMotionLora;
      }
      const res = await axios.post(`${API_BASE}/api/i2v/jobs`, payload);
      const jobId = res.data.id;
      setAnimateJob({ id: jobId, status: 'queued', started_at: Date.now(), engine: animateEngine });

      if (animatePollRef.current) clearInterval(animatePollRef.current);
      animatePollRef.current = setInterval(async () => {
        try {
          const r = await axios.get(`${API_BASE}/api/i2v/jobs/${jobId}`);
          setAnimateJob(prev => ({ ...(prev || {}), ...r.data }));
          if (r.data.status === 'done' || r.data.status === 'error') {
            clearInterval(animatePollRef.current);
            animatePollRef.current = null;
          }
        } catch (e) {
          // keep polling
        }
      }, 5000);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      setAnimateJob({ status: 'error', error: msg });
    }
  };

  useEffect(() => {
    return () => {
      if (animatePollRef.current) clearInterval(animatePollRef.current);
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header + Tabs */}
      <div className="shrink-0 px-4 pt-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 pb-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          <span className="font-semibold text-gray-900 dark:text-gray-100">Tạo ảnh AI</span>

          {activeTab === 'comfyui' && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${serverStatus.alive ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${serverStatus.alive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                ComfyUI {serverStatus.alive ? 'on' : 'off'}
              </span>
              {serverStatus.alive ? (
                <button onClick={stopServer} disabled={serverBusy}
                  className="flex items-center gap-1 h-6 px-2 text-[10px] rounded-md bg-red-50 hover:bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300 disabled:opacity-50">
                  <PowerOff className="w-3 h-3" />{serverBusy ? '...' : 'Tắt'}
                </button>
              ) : (
                <button onClick={startServer} disabled={serverBusy}
                  className="flex items-center gap-1 h-6 px-2 text-[10px] rounded-md bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 disabled:opacity-50">
                  <Power className="w-3 h-3" />{serverBusy ? 'Đang bật...' : 'Bật'}
                </button>
              )}
              {history.length > 0 && (
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{history.length}</span>
              )}
            </div>
          )}
          {activeTab !== 'comfyui' && history.length > 0 && (
            <span className="text-xs text-gray-400 ml-auto bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{history.length}</span>
          )}
        </div>
        <div className="flex gap-1 -mb-px">
          {[
            { key: 'comfyui', label: 'ComfyUI' },
            { key: 'chatgpt', label: 'ChatGPT', badge: totalQuota || null },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === t.key
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
              {t.badge != null && (
                <span className="text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 px-1.5 py-0.5 rounded">{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 mx-4 mt-3 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 ml-2"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Input section */}
        <div className="space-y-3">
          <textarea
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Mô tả hình ảnh bạn muốn tạo..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
          />
          <div>
            <button type="button" onClick={() => setShowNegative(v => !v)}
              className="text-[11px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1">
              {showNegative ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Negative prompt {negativePrompt && <span className="text-purple-500">·</span>}
            </button>
            {showNegative && (
              <textarea
                rows={2}
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="Loại bỏ chi tiết không muốn (vd: text, watermark, blurry, deformed)"
                className="mt-1.5 w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              />
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="w-full sm:w-auto shrink-0 h-9 box-border px-5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2 leading-none"
            >
              {generating ? (
                <><RefreshCw className="w-4 h-4 animate-spin" />
                  {generateJob?.progress
                    ? `Đang tạo ${generateJob.progress.done}/${generateJob.progress.total}...`
                    : 'Đang tạo...'}
                </>
              ) : (
                <><Sparkles className="w-4 h-4" /> Tạo ảnh</>
              )}
            </button>
            {generating && (
              <button onClick={cancelGenerate}
                className="shrink-0 h-9 box-border px-3 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 inline-flex items-center leading-none">
                Ẩn
              </button>
            )}
            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              {tabModels.length > 0 && (
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="h-9 box-border px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 flex-1 sm:flex-none leading-none"
                  title="Model"
                >
                  {tabModels.map(m => (
                    <option key={m.id} value={m.id}>{m.display || m.id}</option>
                  ))}
                </select>
              )}
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="flex-1 sm:flex-none h-9 box-border px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 leading-none"
              >
                {ASPECT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-20 h-9 box-border px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 leading-none"
              >
                {[1,2,3,4].map(n => <option key={n} value={n}>{n} ảnh</option>)}
              </select>
              {activeTab === 'chatgpt' && (
                <button
                  type="button"
                  onClick={() => setShowAccounts(v => !v)}
                  className="h-9 box-border px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 inline-flex items-center gap-1.5 leading-none"
                  title="Quản lý tài khoản ChatGPT"
                >
                  <span className={`h-2 w-2 rounded-full ${activeCount ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                  <span>{activeCount}/{accounts.length}</span>
                  {totalQuota > 0 && (
                    <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">· {totalQuota}</span>
                  )}
                </button>
              )}
            </div>
          </div>
          {(() => {
            const m = tabModels.find(x => x.id === selectedModel)
            if (!m?.workflow_file || workflows.length === 0) return null
            return (
              <div className="flex items-center gap-2 -mt-1">
                <span className="text-[10px] text-gray-500 dark:text-gray-400">Workflow:</span>
                <select
                  value={selectedWorkflow}
                  onChange={(e) => setSelectedWorkflow(e.target.value)}
                  className="h-6 box-border px-2 text-[10px] rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500 leading-none"
                  title="ComfyUI workflow / preset đang dùng"
                >
                  {workflows.map(w => (
                    <option key={w.name} value={w.name}>
                      {w.kind === 'preset' ? '✨' : '⚙'} {w.display || w.name}
                    </option>
                  ))}
                </select>
              </div>
            )
          })()}
          {activeTab === 'chatgpt' && showAccounts && (
            <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Tài khoản ChatGPT · <span className="text-purple-600 dark:text-purple-400">{totalQuota}</span> quota
                </div>
                <button onClick={fetchAccounts} className="text-xs text-purple-600 hover:underline">↻ Làm mới</button>
              </div>
              {accounts.length === 0 && (
                <div className="text-xs text-gray-500 italic">Chưa có tài khoản. Dán access_token vào ô bên dưới.</div>
              )}
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {accounts.map(acc => {
                  const dot = acc.status === 'active' ? 'bg-emerald-500' : acc.status === 'rate_limited' ? 'bg-amber-500' : 'bg-red-500';
                  const restore = acc.restore_at ? new Date(acc.restore_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';
                  return (
                    <div key={acc.token_prefix} className="flex items-center gap-2 text-xs bg-white dark:bg-gray-900 rounded-md px-2.5 py-2 border border-gray-200 dark:border-gray-700">
                      <span className={`shrink-0 h-2 w-2 rounded-full ${dot}`} title={acc.status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-gray-800 dark:text-gray-200">{acc.email_hint || acc.token_prefix}</span>
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{acc.type}</span>
                        </div>
                        {restore && acc.status !== 'active' && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">Hồi lúc {restore}</div>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-purple-600 dark:text-purple-400 font-semibold">{acc.quota_remaining ?? '—'}</span>
                      <button onClick={() => handleRemoveAccount(acc.token_prefix)} className="shrink-0 text-gray-400 hover:text-red-500 ml-1" title="Xoá tài khoản">×</button>
                    </div>
                  );
                })}
              </div>
              <div>
                <textarea
                  rows={3}
                  value={batchTokens}
                  onChange={(e) => setBatchTokens(e.target.value)}
                  placeholder="Mỗi dòng 1 access_token. Dạng: <token>  hoặc  <token> | email"
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
                <button
                  onClick={handleImportBatch}
                  disabled={importingBatch || !batchTokens.trim()}
                  className="mt-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white"
                >
                  {importingBatch ? 'Đang import...' : 'Import token'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Result images */}
        {resultUrls.length > 0 && (
          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <div className={`grid gap-3 ${resultUrls.length === 1 ? 'grid-cols-1 max-w-lg' : 'grid-cols-2 sm:grid-cols-3'}`}>
              {resultUrls.map((url, i) => (
                <div key={i} className="relative group rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`Result ${i + 1}`} className="w-full object-cover max-h-[55vh]" loading="lazy" />
                  </a>
                  <a
                    href={url}
                    download
                    className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Tải xuống"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Lịch sử</span>
            {history.length > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">{history.length}</span>
            )}
            {history.length > 0 && (
              <button
                onClick={handleClearHistory}
                disabled={clearingHistory}
                className="md:hidden ml-auto h-7 px-2.5 text-xs rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors flex items-center gap-1"
                title="Xóa lịch sử"
              >
                <Trash2 className="w-3 h-3" />
                {clearingHistory ? 'Đang xóa...' : 'Xóa'}
              </button>
            )}
            {/* Xoá ảnh trên máy remote ComfyUI — chỉ tab ComfyUI */}
            {activeTab === 'comfyui' && (
              <button
                onClick={handleClearRemote}
                disabled={clearingRemote}
                className="h-7 px-2.5 text-xs rounded-lg bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 text-orange-600 dark:text-orange-400 transition-colors flex items-center gap-1 ml-auto mr-1"
                title="Xoá tất cả ảnh trên máy remote ComfyUI"
              >
                <Trash2 className="w-3 h-3" />
                {clearingRemote ? 'Đang xoá...' : 'Remote'}
              </button>
            )}
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
              <ImageIcon className="w-8 h-8 mb-2" />
              <p className="text-sm">Chưa có lịch sử</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {history.map(item => (
                <HistoryCard
                  key={item.id}
                  item={item}
                  onDelete={handleDelete}
                  onClick={() => window.open(item.image_url || item.thumbnail_url, '_blank')}
                  onAnimate={openAnimate}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Animate (I2V) modal */}
      {animateItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeAnimate}>
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Tạo hoạt ảnh từ ảnh</span>
              </div>
              <button onClick={closeAnimate} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 p-4">
              <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 max-h-56">
                <img src={animateItem.image_url} alt="" className="w-full h-full object-cover" />
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="block mb-1 font-medium text-gray-600 dark:text-gray-300">Engine</label>
                  <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
                    <button onClick={() => setAnimateEngine('wan')}
                      disabled={animateJob?.status === 'queued' || animateJob?.status === 'running'}
                      className={`flex-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${animateEngine === 'wan' ? 'bg-white dark:bg-gray-700 text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                      Wan 2.1 (sắc nét)
                    </button>
                    <button onClick={() => setAnimateEngine('animatediff')}
                      disabled={animateJob?.status === 'queued' || animateJob?.status === 'running'}
                      className={`flex-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${animateEngine === 'animatediff' ? 'bg-white dark:bg-gray-700 text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                      AnimateDiff (nhanh)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block mb-1 font-medium text-gray-600 dark:text-gray-300">Chuyển động (prompt EN)</label>
                  <textarea rows={2} value={animatePrompt} onChange={e => setAnimatePrompt(e.target.value)}
                    disabled={animateJob?.status === 'queued' || animateJob?.status === 'running'}
                    className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-purple-500 outline-none resize-none disabled:opacity-50" />
                </div>
                <div>
                  <button type="button" onClick={() => setAnimateShowNegative(v => !v)}
                    className="text-[10px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
                    {animateShowNegative ? '▲' : '▼'} Negative prompt {animateNegative && <span className="text-purple-500">·</span>}
                  </button>
                  {animateShowNegative && (
                    <textarea rows={2} value={animateNegative} onChange={e => setAnimateNegative(e.target.value)}
                      disabled={animateJob?.status === 'queued' || animateJob?.status === 'running'}
                      placeholder="static, blurry, low quality, distorted (EN)"
                      className="mt-1 w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-purple-500 outline-none resize-none disabled:opacity-50" />
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block mb-1 font-medium text-gray-600 dark:text-gray-300">Tỉ lệ</label>
                    <select value={animateSize} onChange={e => setAnimateSize(e.target.value)}
                      disabled={animateJob?.status === 'queued' || animateJob?.status === 'running'}
                      className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 disabled:opacity-50">
                      {animateEngine === 'animatediff' ? (
                        <>
                          <option value="square">Vuông 512×512</option>
                          <option value="landscape">Ngang 768×432</option>
                          <option value="portrait">Dọc 432×768</option>
                        </>
                      ) : (
                        <>
                          <option value="landscape">Ngang 832×480</option>
                          <option value="portrait">Dọc 480×832</option>
                          <option value="square">Vuông 640×640</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="block mb-1 font-medium text-gray-600 dark:text-gray-300">Frames</label>
                    <select value={animateLength} onChange={e => setAnimateLength(Number(e.target.value))}
                      disabled={animateJob?.status === 'queued' || animateJob?.status === 'running'}
                      className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 disabled:opacity-50">
                      {(animateEngine === 'animatediff' ? [8, 16, 24, 32, 48] : [17, 25, 33, 49, 65, 81]).map(n =>
                        <option key={n} value={n}>{n}</option>
                      )}
                    </select>
                  </div>
                  <div className="w-20">
                    <label className="block mb-1 font-medium text-gray-600 dark:text-gray-300">Steps</label>
                    <select value={animateSteps} onChange={e => setAnimateSteps(Number(e.target.value))}
                      disabled={animateJob?.status === 'queued' || animateJob?.status === 'running'}
                      className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 disabled:opacity-50">
                      {(animateEngine === 'animatediff' ? [15, 20, 25, 30] : [10, 15, 20, 25]).map(n =>
                        <option key={n} value={n}>{n}</option>
                      )}
                    </select>
                  </div>
                </div>

                {animateEngine === 'animatediff' && (
                  <div>
                    <label className="block mb-1 font-medium text-gray-600 dark:text-gray-300">Motion LoRA</label>
                    <select value={animateMotionLora} onChange={e => setAnimateMotionLora(e.target.value)}
                      disabled={animateJob?.status === 'queued' || animateJob?.status === 'running'}
                      className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 disabled:opacity-50">
                      <option value="">Không</option>
                      <option value="animatediff_motion_lora_zoom_in.safetensors">Zoom in</option>
                      <option value="animatediff_motion_lora_zoom_out.safetensors">Zoom out</option>
                      <option value="animatediff_motion_lora_pan_left.safetensors">Pan left</option>
                      <option value="animatediff_motion_lora_pan_right.safetensors">Pan right</option>
                      <option value="animatediff_motion_lora_tilt_up.safetensors">Tilt up</option>
                      <option value="animatediff_motion_lora_tilt_down.safetensors">Tilt down</option>
                      <option value="animatediff_motion_lora_rolling_clockwise.safetensors">Rolling CW</option>
                      <option value="animatediff_motion_lora_rolling_anticlockwise.safetensors">Rolling CCW</option>
                    </select>
                  </div>
                )}

                <div className="text-[10px] text-gray-500 dark:text-gray-400">
                  {animateEngine === 'animatediff'
                    ? `~${Math.round(animateLength / 8 * 100) / 100}s @8fps · ~${Math.max(1, Math.round(animateSteps * 0.08))} phút`
                    : `~${Math.round(animateLength / 16 * 100) / 100}s @16fps · ~${Math.round(animateSteps * 0.85)} phút`}
                </div>

                {!animateJob && (
                  <button onClick={startAnimate}
                    className="w-full mt-2 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs">
                    🎞️ Tạo hoạt ảnh
                  </button>
                )}

                {animateJob && (animateJob.status === 'queued' || animateJob.status === 'running') && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 flex items-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>{animateJob.status === 'queued' ? 'Đang xếp hàng...' : 'Đang render trên GPU...'}</span>
                    {animateJob.started_at && (
                      <span className="ml-auto text-[10px] text-purple-500">
                        {Math.floor((Date.now() / 1000 - (animateJob.started_at || Date.now() / 1000)))}s
                      </span>
                    )}
                  </div>
                )}

                {animateJob?.status === 'error' && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 break-all">
                    Lỗi: {animateJob.error}
                  </div>
                )}

                {animateJob?.status === 'done' && animateJob.result?.video_url && (
                  <div className="mt-2 space-y-2">
                    <video src={animateJob.result.video_url} controls autoPlay loop
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-black" />
                    <div className="flex gap-2">
                      <a href={animateJob.result.video_url} download
                        className="flex-1 px-3 py-1.5 rounded bg-gray-900 hover:bg-black text-white text-center font-medium">
                        📥 Tải MP4
                      </a>
                      <button onClick={() => setAnimateJob(null)}
                        className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium">
                        Tạo lại
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoTab;
