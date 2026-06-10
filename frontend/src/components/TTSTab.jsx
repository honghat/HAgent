import React, { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const EDGE_VOICES = [
  { value: 'vi-VN-HoaiMyNeural', label: 'Hoài My (Nữ)', lang: 'vi', flag: '🇻🇳' },
  { value: 'vi-VN-NamMinhNeural', label: 'Nam Minh (Nam)', lang: 'vi', flag: '🇻🇳' },
  { value: 'en-US-AriaNeural', label: 'Aria (Nữ — US)', lang: 'en', flag: '🇺🇸' },
  { value: 'en-US-JennyNeural', label: 'Jenny (Nữ — US)', lang: 'en', flag: '🇺🇸' },
  { value: 'en-US-GuyNeural', label: 'Guy (Nam — US)', lang: 'en', flag: '🇺🇸' },
  { value: 'en-US-ChristopherNeural', label: 'Christopher (Nam — US)', lang: 'en', flag: '🇺🇸' },
  { value: 'en-US-EricNeural', label: 'Eric (Nam — US)', lang: 'en', flag: '🇺🇸' },
  { value: 'en-GB-SoniaNeural', label: 'Sonia (Nữ — UK)', lang: 'en', flag: '🇬🇧' },
  { value: 'en-GB-RyanNeural', label: 'Ryan (Nam — UK)', lang: 'en', flag: '🇬🇧' },
  { value: 'en-AU-NatashaNeural', label: 'Natasha (Nữ — AU)', lang: 'en', flag: '🇦🇺' },
  { value: 'en-AU-WilliamNeural', label: 'William (Nam — AU)', lang: 'en', flag: '🇦🇺' },
  { value: 'ja-JP-NanamiNeural', label: 'Nanami (Nữ)', lang: 'ja', flag: '🇯🇵' },
  { value: 'ja-JP-KeitaNeural', label: 'Keita (Nam)', lang: 'ja', flag: '🇯🇵' },
  { value: 'ko-KR-SunHiNeural', label: 'SunHi (Nữ)', lang: 'ko', flag: '🇰🇷' },
  { value: 'ko-KR-InJoonNeural', label: 'InJoon (Nam)', lang: 'ko', flag: '🇰🇷' },
  { value: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao (Nữ)', lang: 'zh', flag: '🇨🇳' },
  { value: 'zh-CN-YunxiNeural', label: 'Yunxi (Nam)', lang: 'zh', flag: '🇨🇳' },
  { value: 'fr-FR-DeniseNeural', label: 'Denise (Nữ)', lang: 'fr', flag: '🇫🇷' },
  { value: 'fr-FR-HenriNeural', label: 'Henri (Nam)', lang: 'fr', flag: '🇫🇷' },
  { value: 'de-DE-KatjaNeural', label: 'Katja (Nữ)', lang: 'de', flag: '🇩🇪' },
  { value: 'de-DE-ConradNeural', label: 'Conrad (Nam)', lang: 'de', flag: '🇩🇪' },
  { value: 'es-ES-ElviraNeural', label: 'Elvira (Nữ)', lang: 'es', flag: '🇪🇸' },
  { value: 'es-ES-AlvaroNeural', label: 'Alvaro (Nam)', lang: 'es', flag: '🇪🇸' },
];

const LUX_VOICES = [
  { value: 'en_female', label: 'Female (EN)', lang: 'en', flag: '🇺🇸' },
  { value: 'en_male', label: 'Male (EN)', lang: 'en', flag: '🇺🇸' },
  { value: 'en_us', label: 'US Voice', lang: 'en', flag: '🇺🇸' },
  { value: 'paul', label: 'Paul', lang: 'en', flag: '🇺🇸' },
];

const PIPER_VOICES = [
  { value: 'vi_female', label: 'VI Nữ (Piper)', lang: 'vi', flag: '🇻🇳' },
  { value: 'vi_male', label: 'VI Nam (Piper)', lang: 'vi', flag: '🇻🇳' },
];

const GOOGLE_VOICES = [
  { value: 'vi', label: 'Tiếng Việt', lang: 'vi', flag: '🇻🇳' },
  { value: 'en', label: 'English', lang: 'en', flag: '🇺🇸' },
  { value: 'ja', label: '日本語', lang: 'ja', flag: '🇯🇵' },
  { value: 'ko', label: '한국어', lang: 'ko', flag: '🇰🇷' },
  { value: 'zh-CN', label: '中文', lang: 'zh', flag: '🇨🇳' },
  { value: 'fr', label: 'Français', lang: 'fr', flag: '🇫🇷' },
  { value: 'de', label: 'Deutsch', lang: 'de', flag: '🇩🇪' },
  { value: 'es', label: 'Español', lang: 'es', flag: '🇪🇸' },
];

const KOKORO_VOICES = [
  { value: 'af_sky', label: 'Sky (Female)', lang: 'en', flag: '🇺🇸' },
  { value: 'af_bella', label: 'Bella (Female)', lang: 'en', flag: '🇺🇸' },
  { value: 'af_sarah', label: 'Sarah (Female)', lang: 'en', flag: '🇺🇸' },
  { value: 'am_adam', label: 'Adam (Male)', lang: 'en', flag: '🇺🇸' },
  { value: 'am_michael', label: 'Michael (Male)', lang: 'en', flag: '🇺🇸' },
  { value: 'bf_emma', label: 'Emma (British)', lang: 'en', flag: '🇬🇧' },
  { value: 'bm_george', label: 'George (British)', lang: 'en', flag: '🇬🇧' },
];

const BROWSER_VOICES = [
  { value: 'vi-VN', label: 'Tiếng Việt', lang: 'vi', flag: '🇻🇳' },
  { value: 'en-US', label: 'English (US)', lang: 'en', flag: '🇺🇸' },
  { value: 'en-GB', label: 'English (UK)', lang: 'en', flag: '🇬🇧' },
  { value: 'ja-JP', label: '日本語', lang: 'ja', flag: '🇯🇵' },
  { value: 'ko-KR', label: '한국어', lang: 'ko', flag: '🇰🇷' },
  { value: 'zh-CN', label: '中文', lang: 'zh', flag: '🇨🇳' },
  { value: 'fr-FR', label: 'Français', lang: 'fr', flag: '🇫🇷' },
  { value: 'de-DE', label: 'Deutsch', lang: 'de', flag: '🇩🇪' },
  { value: 'es-ES', label: 'Español', lang: 'es', flag: '🇪🇸' },
];

const LANG_LABELS = {
  all: 'Tất cả',
  vi: 'Tiếng Việt',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
};

const SERVERS = [
  { id: 'edge', label: 'Edge', desc: 'Microsoft online', help: 'Giọng tự nhiên, nhiều ngôn ngữ, cần internet' },
  { id: 'google', label: 'Google', desc: 'gTTS (miễn phí)', help: 'Miễn phí, chỉ chọn ngôn ngữ, không có giọng cụ thể' },
  { id: 'browser', label: 'Browser', desc: 'Trình duyệt (offline)', help: 'Chạy offline, giọng phụ thuộc hệ điều hành' },
  { id: 'kokoro', label: 'Kokoro', desc: 'Remote :8881 (EN)', help: 'Giọng English tự nhiên, cần bật tunnel đến máy remote' },
  { id: 'lux', label: 'Lux', desc: 'Remote :8880', help: 'TTS chất lượng cao, cần bật tunnel đến máy remote' },
  { id: 'piper', label: 'Piper', desc: 'Local :5001', help: 'TTS offline, cần cài Piper và chạy local server' },
];

export default function TTSTab() {
  // Load saved preferences from localStorage
  const savedPrefs = JSON.parse(localStorage.getItem('tts_preferences') || '{}');

  const [text, setText] = useState(savedPrefs.text || '');
  const [server, setServer] = useState(savedPrefs.server || 'edge');
  const [lang, setLang] = useState(savedPrefs.lang || 'vi');
  const [voice, setVoice] = useState(savedPrefs.voice || 'vi-VN-HoaiMyNeural');
  const [rate, setRate] = useState(savedPrefs.rate || 0);
  const [pitch, setPitch] = useState(savedPrefs.pitch || 0);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [status, setStatus] = useState({});
  const [toggling, setToggling] = useState(null);
  const audioRef = useRef(null);

  const fetchStatus = async () => {
    try {
      const r = await axios.get(`${API_BASE}/api/tts/status`);
      setStatus(r.data || {});
    } catch (e) {}
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 15000);
    return () => clearInterval(t);
  }, []);

  // Save preferences to localStorage whenever they change
  useEffect(() => {
    const prefs = { text, server, lang, voice, rate, pitch };
    localStorage.setItem('tts_preferences', JSON.stringify(prefs));
  }, [text, server, lang, voice, rate, pitch]);

  const toggleServer = async (id, action) => {
    setToggling(id);
    try {
      await axios.post(`${API_BASE}/api/tts/toggle`, { server: id, action });
      await fetchStatus();
    } catch (e) {
      alert(`Lỗi ${action} ${id}: ` + (e.response?.data?.detail || e.message));
    } finally {
      setToggling(null);
    }
  };

  const allVoices = useMemo(() => {
    if (server === 'edge') return EDGE_VOICES;
    if (server === 'lux') return LUX_VOICES;
    if (server === 'piper') return PIPER_VOICES;
    if (server === 'google') return GOOGLE_VOICES;
    if (server === 'browser') return BROWSER_VOICES;
    if (server === 'kokoro') return KOKORO_VOICES;
    return [];
  }, [server]);

  const filteredVoices = useMemo(
    () => (lang === 'all' ? allVoices : allVoices.filter(v => v.lang === lang)),
    [allVoices, lang],
  );

  useEffect(() => {
    const valid = allVoices.find(v => v.value === voice);
    if (!valid) {
      setVoice(allVoices[0]?.value || '');
      if (allVoices[0] && !allVoices.find(v => v.lang === lang)) {
        setLang('all');
      }
    }
  }, [server]);

  useEffect(() => () => audioUrl && URL.revokeObjectURL(audioUrl), [audioUrl]);

  const handleGenerate = async () => {
    if (!text.trim()) {
      alert('Nhập text để tạo giọng nói');
      return;
    }

    // Browser TTS sử dụng Web Speech API
    if (server === 'browser') {
      if (!window.speechSynthesis) {
        alert('Trình duyệt không hỗ trợ Web Speech API');
        return;
      }
      setLoading(true);
      try {
        const utterance = new SpeechSynthesisUtterance(text.trim());

        // Tìm giọng phù hợp với ngôn ngữ đã chọn
        const voices = window.speechSynthesis.getVoices();
        const selectedVoice = voices.find(v => v.lang === voice || v.lang.startsWith(voice.split('-')[0]));
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
        utterance.lang = voice;
        utterance.rate = 1 + rate / 100;
        utterance.pitch = 1 + pitch / 50;

        window.speechSynthesis.speak(utterance);
        utterance.onend = () => setLoading(false);
        utterance.onerror = () => {
          setLoading(false);
          alert('Lỗi khi phát giọng nói');
        };
      } catch (error) {
        setLoading(false);
        alert('Lỗi TTS: ' + error.message);
      }
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${API_BASE}/api/tts/speak`,
        {
          text: text.trim(),
          server,
          voice,
          rate: rate === 0 ? '+0%' : (rate > 0 ? `+${rate}%` : `${rate}%`),
          pitch: pitch === 0 ? '+0Hz' : (pitch > 0 ? `+${pitch}Hz` : `${pitch}Hz`),
          speed: server === 'edge' ? undefined : (1 + rate / 100),
        },
        { responseType: 'blob' },
      );
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const url = URL.createObjectURL(response.data);
      setAudioUrl(url);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.onended = () => {
          URL.revokeObjectURL(url);
        };
        audioRef.current.play().catch(() => {});
      }
    } catch (error) {
      let detail = error.response?.data?.detail || error.message;
      if (error.response?.data instanceof Blob) {
        try { detail = JSON.parse(await error.response.data.text()).detail; } catch {}
      }
      alert('Lỗi TTS: ' + detail);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `tts-${server}.mp3`;
    a.click();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-2 sm:px-4">
      {/* Header với hướng dẫn */}
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white">
            <span className="text-lg">🎙️</span>
          </div>
          <div className="flex-1">
            <h3 className="mb-1 text-sm font-bold text-indigo-900">Text to Speech</h3>
            <p className="text-xs text-indigo-700">Chuyển văn bản thành giọng nói với nhiều engine khác nhau</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Cột trái: Chọn Engine */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Chọn Engine</h4>
            <div className="space-y-2">
              {SERVERS.map(s => {
                const st = status[s.id];
                const online = st?.available;
                const active = server === s.id;
                const isToggling = toggling === s.id;
                return (
                  <div
                    key={s.id}
                    className={`group relative overflow-hidden rounded-lg border transition-all ${
                      active
                        ? 'border-indigo-400 bg-indigo-50 shadow-md'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <button
                      onClick={() => setServer(s.id)}
                      className="flex w-full items-center gap-3 p-3 text-left"
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        active ? 'bg-indigo-500' : 'bg-gray-100 group-hover:bg-gray-200'
                      }`}>
                        <span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-bold ${active ? 'text-indigo-700' : 'text-gray-900'}`}>
                          {s.label}
                        </div>
                        <div className="text-[11px] text-gray-500">{s.desc}</div>
                        {s.help && (
                          <div className="mt-1 text-[10px] text-gray-400">{s.help}</div>
                        )}
                      </div>
                    </button>
                    {s.id === 'lux' || s.id === 'kokoro' || s.id === 'piper' ? (
                      <div className="absolute right-2 top-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleServer(s.id, online ? 'off' : 'on');
                          }}
                          disabled={isToggling}
                          className={`rounded-md px-2 py-1 text-[10px] font-bold transition disabled:opacity-50 ${
                            online
                              ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                              : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          }`}
                        >
                          {isToggling ? '...' : online ? 'Tắt' : 'Bật'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Cột phải: Cấu hình & Tạo giọng */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Nội dung</h4>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Nhập văn bản cần chuyển thành giọng nói..."
              rows={6}
              className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Cấu hình giọng</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Ngôn ngữ</label>
                <select
                  value={lang}
                  onChange={e => setLang(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                >
                  {Object.entries(LANG_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Giọng đọc</label>
                <select
                  value={voice}
                  onChange={e => setVoice(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                >
                  {filteredVoices.length === 0 && <option value="">— không có voice —</option>}
                  {filteredVoices.map(v => (
                    <option key={v.value} value={v.value}>{v.flag} {v.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                  Tốc độ: {rate > 0 ? '+' : ''}{rate}%
                </label>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={rate}
                  onChange={e => setRate(parseInt(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              {server === 'edge' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                    Cao độ: {pitch > 0 ? '+' : ''}{pitch}Hz
                  </label>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    value={pitch}
                    onChange={e => setPitch(parseInt(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading || !text.trim() || !voice}
              className="mt-4 w-full rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-500 py-3 text-sm font-bold text-white shadow-md transition-all hover:from-indigo-700 hover:to-indigo-600 hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? '⏳ Đang tạo giọng nói...' : '🎵 Tạo giọng nói'}
            </button>
          </div>

          {audioUrl && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-bold text-emerald-900">✅ Kết quả</h4>
                <button
                  onClick={handleDownload}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                >
                  ⬇ Tải xuống
                </button>
              </div>
              <audio ref={audioRef} controls className="w-full rounded-lg" style={{ height: '40px' }}>
                <source src={audioUrl} type="audio/mpeg" />
              </audio>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
