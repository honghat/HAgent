'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { stopTTS } from '@/lib/tts';
import GuideTab from './_tabs/GuideTab';
import DictTab from './_tabs/DictTab';
import VocabTab from './_tabs/VocabTab';
import ReadTab from './_tabs/ReadTab';
import GrammarTab from './_tabs/GrammarTab';
import WriteTab from './_tabs/WriteTab';
import SpeakTab from './_tabs/SpeakTab';
import CurriculumTab from './_tabs/CurriculumTab';

import {
  LEVEL_COLORS,
  WRITING_PROMPTS,
  SPEAKING_TOPICS,
  LISTEN_SCENARIOS,
  READ_LEVELS,
  CEFR_CURRICULUM,
  UNIT_CURRICULUM,
  READ_TOPICS,
  VOCAB_TOPICS,
  INTERVIEW_VOCAB_TOPICS,
  GRAMMAR_TOPICS,
  INTERVIEW_GRAMMAR_TOPICS,
  TABS,
  MODES,
  LearnMode
} from './constants';

import {
  askAI,
  extractJsonObject,
  extractJsonArray,
  errorText,
  cleanTopic,
  saveToDb,
  speak,
  parseMarkdown,
  cefrHint as cefrHintBase,
  updateLessonMetadata,
  genTopicTask,
  speakBrowser
} from './utils';

const cefrHint = (lv: string) => cefrHintBase(lv, CEFR_CURRICULUM);


interface EngLesson { id: number; type: string; content: string; metadata: string; completed: boolean; learnCount: number; createdAt: string; nextReviewAt?: string | null; lastReviewedAt?: string | null; intervalDays?: number; easeFactor?: number; reviewCount?: number; }




const CURRICULUM_LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1'];

function curriculumLevelOffset(level: string): number {
  const idx = CURRICULUM_LEVEL_ORDER.indexOf(level);
  if (idx < 0) return 0;
  return CURRICULUM_LEVEL_ORDER
    .slice(0, idx)
    .reduce((sum, lv) => sum + (UNIT_CURRICULUM[lv]?.length || 0), 0);
}

function curriculumDisplayUnitNumber(level: string, levelUnit: number): number {
  return curriculumLevelOffset(level) + levelUnit;
}

function curriculumLocalUnitNumber(level: string, unit: number, levelUnit?: number): number {
  if (levelUnit) return levelUnit;
  const offset = curriculumLevelOffset(level);
  const count = UNIT_CURRICULUM[level]?.length || 0;
  if (unit > offset && unit <= offset + count) return unit - offset;
  return unit;
}



export default function EnglishContent() {
  const [me, setMe] = useState<{ id: number; name: string; role: string } | null>(null);
  const isAdmin = me?.role === 'admin';

  // Global Voice Settings (Synced across all tabs)
  const [globalVoice, setGlobalVoice] = useState('en-US-AvaNeural');
  const [globalTtsProvider, setGlobalTtsProvider] = useState<'edge' | 'luxtts'>('edge');
  const [globalSpeed, setGlobalSpeed] = useState(1.0);
  const [tab, setTab] = useState<'curriculum' | 'listen' | 'speak' | 'write' | 'vocab' | 'read' | 'dict' | 'grammar' | 'guide'>('curriculum');
  const [mode, setMode] = useState<LearnMode>('coder');
  const [aiModel, setAiModel] = useState('default');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const savedMode = localStorage.getItem('eng_mode') as LearnMode;
    if (savedMode) setMode(savedMode);
    const savedModel = localStorage.getItem('eng_model');
    if (savedModel) setAiModel(savedModel);

    const savedVoice = localStorage.getItem('eng_voice');
    if (savedVoice) setGlobalVoice(savedVoice);
    const savedProvider = localStorage.getItem('eng_provider');
    if (savedProvider) setGlobalTtsProvider(savedProvider as any);
    const savedSpeed = localStorage.getItem('eng_speed');
    if (savedSpeed) setGlobalSpeed(parseFloat(savedSpeed));

    // Check auth
    fetch('/api/auth').then(r => r.json()).then(d => {
      if (d.user) setMe(d.user);
    }).catch(() => { });
  }, []);

  const [ttsOnline, setTtsOnline] = useState(false);
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('eng_mode', mode);
      localStorage.setItem('eng_model', aiModel);
      localStorage.setItem('eng_voice', globalVoice);
      localStorage.setItem('eng_provider', globalTtsProvider);
      localStorage.setItem('eng_speed', globalSpeed.toString());
    }
  }, [mode, aiModel, globalVoice, globalTtsProvider, globalSpeed, isMounted]);
  const modeDesc = MODES.find(m => m.id === mode)?.desc || 'developer';

  // Listening
  const [listenLevel, setListenLevel] = useState('A2');
  const [listenCustomTopic, setListenCustomTopic] = useState('');
  const [listenText, setListenText] = useState('');
  const [listenVi, setListenVi] = useState('');
  const [listenVocab, setListenVocab] = useState<{ w: string; m: string }[]>([]);
  const [showListenVi, setShowListenVi] = useState(false);
  const [listenLoading, setListenLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [listenLooping, setListenLooping] = useState(false);
  const listenLoopingRef = useRef(false);
  const [listenRecordId, setListenRecordId] = useState<number | null>(null);
  const [listenElapsed, setListenElapsed] = useState(0);

  // Speaking
  const [spkLevel, setSpkLevel] = useState('A2');
  const [spkTopic, setSpkTopic] = useState('Tell me about your typical day as a software developer.');
  const [spkCustomTopic, setSpkCustomTopic] = useState('');
  const [spkSampleDirection, setSpkSampleDirection] = useState('');
  const [spkTopicError, setSpkTopicError] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [spkFeedback, setSpkFeedback] = useState('');
  const [spkLoading, setSpkLoading] = useState(false);
  const [spkTopicLoading, setSpkTopicLoading] = useState(false);
  const [sttStatus, setSttStatus] = useState('');
  const [spkSample, setSpkSample] = useState('');
  const [spkSampleLoading, setSpkSampleLoading] = useState(false);
  const [spkRecordId, setSpkRecordId] = useState<number | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Writing
  const [writeLevel, setWriteLevel] = useState('A2');
  const [writeText, setWriteText] = useState('');
  const [writePrompt, setWritePrompt] = useState(WRITING_PROMPTS[0]);
  const [writeCustomPrompt, setWriteCustomPrompt] = useState('');
  const [writeSampleDirection, setWriteSampleDirection] = useState('');
  const [writeTopicError, setWriteTopicError] = useState('');
  const [writeFeedback, setWriteFeedback] = useState('');
  const [writeLoading, setWriteLoading] = useState(false);
  const [writeTopicLoading, setWriteTopicLoading] = useState(false);
  const [writeSample, setWriteSample] = useState('');
  const [writeSampleLoading, setWriteSampleLoading] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const [writeRecordId, setWriteRecordId] = useState<number | null>(null);

  // Vocab
  const [vocabTopic, setVocabTopic] = useState('programming');
  const [cards, setCards] = useState<{ word: string; def: string; ex: string; vi: string }[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [known, setKnown] = useState<number[]>([]);
  const [vocabRecordId, setVocabRecordId] = useState<number | null>(null);

  // Reading
  const [level, setLevel] = useState('A2'); // Global Level
  const [readLevel, setReadLevel] = useState('A2');
  const [readTopic, setReadTopic] = useState('Web Development');
  const [readCustomTopic, setReadCustomTopic] = useState('');
  const [readLoading, setReadLoading] = useState(false);
  const [readArticle, setReadArticle] = useState<{ title: string; body: string; wordCount: number } | null>(null);
  const [readRecordId, setReadRecordId] = useState<number | null>(null);
  const [readQuestions, setReadQuestions] = useState<{ q: string; options: string[]; answer: number }[]>([]);
  const [readAnswers, setReadAnswers] = useState<number[]>([]);
  const [readSubmitted, setReadSubmitted] = useState(false);
  const [readSelected, setReadSelected] = useState('');
  const [readLookup, setReadLookup] = useState('');
  const [readLookupLoading, setReadLookupLoading] = useState(false);
  const [readChat, setReadChat] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [readChatInput, setReadChatInput] = useState('');
  const [readChatLoading, setReadChatLoading] = useState(false);
  const [readError, setReadError] = useState('');
  const [readSpeaking, setReadSpeaking] = useState(false);

  // Unit context
  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);
  const [selectedUnitTitle, setSelectedUnitTitle] = useState<string>('');

  // Sync Global Level to tabs
  const changeGlobalLevel = (lv: string) => {
    setLevel(lv);
    setListenLevel(lv);
    setSpkLevel(lv);
    setWriteLevel(lv);
    setReadLevel(lv);
    localStorage.setItem('eng_level', lv);
  };

  useEffect(() => {
    const savedLevel = localStorage.getItem('eng_level');
    if (savedLevel) changeGlobalLevel(savedLevel);
  }, []);

  // Batch
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const [batchMsg, setBatchMsg] = useState('');
  const batchStopRef = useRef(false);

  // Grammar
  const [grammarTopic, setGrammarTopic] = useState(GRAMMAR_TOPICS[0]);
  const [grammarCustomTopic, setGrammarCustomTopic] = useState('');
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarLesson, setGrammarLesson] = useState<string | null>(null);
  const [grammarRecordId, setGrammarRecordId] = useState<number | null>(null);
  const [grammarQuizAnswers, setGrammarQuizAnswers] = useState<string[]>([]);
  const [grammarUserAnswers, setGrammarUserAnswers] = useState<string[]>([]);
  const [grammarSubmitted, setGrammarSubmitted] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Flag để skip auto-load khi loadLesson đã set dữ liệu rồi
  const skipAutoLoadRef = useRef(false);


  async function genGrammarLesson() {
    setGrammarLoading(true); setGrammarLesson(null); setGrammarSubmitted(false); setGrammarUserAnswers([]);
    const p = `Bạn là một giáo viên dạy Tiếng Anh chuyên nghiệp. Hãy soạn một bài giảng NGỮ PHÁP CHI TIẾT về chủ đề: "${grammarTopic}".
    Sử dụng Markdown để trình bày đẹp mắt.

    Cấu trúc bài giảng bắt buộc (Giải thích bằng Tiếng Việt):
    ### 1. Khái niệm & Cấu trúc
    (Định nghĩa và công thức chính, trình bày công thức rõ ràng)

    ### 2. Cách dùng & Ví dụ
    (Giải thích các trường hợp sử dụng. Với mỗi trường hợp, đưa ra ít nhất 1 ví dụ thực tế)
    - **Ví dụ**: *English sentence* -> Bản dịch tiếng Việt

    ### 3. Lưu ý (nếu có)
    (Các lỗi thường gặp hoặc mẹo ghi nhớ)

    ### 4. Quiz
    Q1: [Câu hỏi]
    A) [Lựa chọn] B) [Lựa chọn] C) [Lựa chọn]
    ANSWER: [A/B/C]

    Lưu ý: Bắt đầu tiêu đề phần bằng ###. Trình bày sạch sẽ, không dùng quá nhiều cấp độ tiêu đề.`;

    try {
      const result = await genTopicTask('grammar', p, () => { });
      if (result) {
        const { content, id } = result;
        setGrammarLesson(content);
        const ans: string[] = [];
        const ms = content.matchAll(/ANSWER:\s*([ABC])/g);
        for (const m of ms) ans.push(m[1]);
        setGrammarQuizAnswers(ans);
        setGrammarUserAnswers(ans.map(() => ''));
        setGrammarRecordId(id);
        // Update metadata for the record already created by server
        await updateLessonMetadata(id, { topic: grammarTopic, mode });
        loadHistory();
      }
    } catch (e) {
      alert(String(e));
    } finally {
      setGrammarLoading(false);
    }
  }

  // Dict
  const [dictInput, setDictInput] = useState('');
  const [dictResult, setDictResult] = useState('')
  const [dictLoading, setDictLoading] = useState(false);

  // History
  const [history, setHistory] = useState<EngLesson[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  function loadLesson(item: EngLesson) {
    skipAutoLoadRef.current = true; // Ngăn useEffect đè lại
    const mapType = item.type;
    if (mapType === 'listen') {
      setListenText(item.content);
      try {
        const m = JSON.parse(item.metadata || '{}');
        setListenVi(m.vi || '');
        setListenVocab(m.vocab || []);
        setListenLevel(m.level || 'A2');
        if (m.unit) setSelectedUnit(Number(m.unit));
        if (m.unitTitle) setSelectedUnitTitle(m.unitTitle);
        if (m.level) setLevel(m.level);
        setListenRecordId(item.id);
      } catch { }
      setShowListenVi(false);
      setTab('listen');
    } else if (mapType === 'speak') {
      setSpkRecordId(item.id);
      try {
        const m = JSON.parse(item.metadata || '{}');
        if (m.topic) setSpkTopic(m.topic);
        setSpkLevel(m.level || 'A2');
        if (m.unit) setSelectedUnit(Number(m.unit));
        if (m.unitTitle) setSelectedUnitTitle(m.unitTitle);
        if (m.level) setLevel(m.level);
      } catch { }
      setTranscript('');
      setTab('speak');
    } else if (mapType === 'writing') {
      setWriteText(item.content);
      setWriteRecordId(item.id);
      try {
        const m = JSON.parse(item.metadata || '{}');
        if (m.prompt) setWritePrompt(m.prompt);
        setWriteFeedback(m.feedback || '');
        setWriteLevel(m.level || 'A2');
        if (m.unit) setSelectedUnit(Number(m.unit));
        if (m.unitTitle) setSelectedUnitTitle(m.unitTitle);
        if (m.level) setLevel(m.level);
      } catch { }
      setTab('write');
    } else if (mapType === 'reading') {
      setReadRecordId(item.id);
      try {
        const m = JSON.parse(item.metadata || '{}');
        setReadTopic(m.topic || '');
        setReadLevel(m.level || 'B1');
        if (m.unit) setSelectedUnit(Number(m.unit));
        if (m.unitTitle) setSelectedUnitTitle(m.unitTitle);
        if (m.level) setLevel(m.level);
        setReadQuestions(m.questions || []);
        setReadAnswers([]);
        setReadSubmitted(false);
        setReadArticle({ title: m.title || '', body: item.content, wordCount: item.content.split(/\s+/).length });
      } catch { }
      setReadSelected(''); setReadLookup(''); setReadChat([]);
      setTab('read');
    } else if (mapType === 'grammar') {
      setGrammarLesson(item.content);
      setGrammarRecordId(item.id);
      setGrammarSubmitted(false);
      try {
        const m = JSON.parse(item.metadata || '{}');
        if (m.topic) setGrammarTopic(m.topic);
        if (m.unit) setSelectedUnit(Number(m.unit));
        if (m.unitTitle) setSelectedUnitTitle(m.unitTitle);
        if (m.level) setLevel(m.level);
        const ans: string[] = [];
        const ms = item.content.matchAll(/ANSWER:\s*([ABC])/g);
        for (const m of ms) ans.push(m[1]);
        setGrammarQuizAnswers(ans);
        setGrammarUserAnswers(ans.map(() => ''));
      } catch { }
      setTab('grammar');
    } else if (mapType === 'vocab') {
      let unitCards: { word: string; def: string; ex: string; vi: string }[] = [];
      try {
        const m = JSON.parse(item.metadata || '{}');
        if (m.unit) setSelectedUnit(Number(m.unit));
        if (m.level) setLevel(m.level);
        if (m.unit && m.mode) {
          // Tìm các từ cùng Unit & Mode
          const unitWords = history.filter(h => {
            if (h.type !== 'vocab') return false;
            try {
              const hm = JSON.parse(h.metadata || '{}');
              return hm.unit === m.unit && hm.mode === m.mode && (hm.level || '') === (m.level || '');
            } catch { return false; }
          });
          unitCards = unitWords.map(h => {
            try {
              const hm = JSON.parse(h.metadata || '{}');
              return { word: h.content, def: hm.def || '', ex: hm.ex || '', vi: hm.vi || '' };
            } catch { return { word: h.content, def: '', ex: '', vi: '' }; }
          });
          setVocabRecordId(item.id); // Dùng ID của từ đang nhấn (hoặc từ đầu tiên)
        } else if (m.def) {
          unitCards = [{ word: item.content, def: m.def, ex: m.ex, vi: m.vi }];
          setVocabRecordId(item.id);
        }
      } catch { }

      if (unitCards.length > 0) {
        setCards(unitCards);
        const idx = unitCards.findIndex(c => c.word === item.content);
        setCardIdx(idx !== -1 ? idx : 0);
        setFlipped(unitCards.length === 1);
        setKnown([]);
        setTab('vocab');
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteUnit(unitNum: number | number[], level: string) {
    const unitNums = Array.isArray(unitNum) ? unitNum : [unitNum];
    const label = unitNums.length > 1 ? unitNums.join('/') : String(unitNums[0]);
    if (!confirm(`Xóa toàn bộ Bài ${label} (${level})? Thao tác này không thể hoàn tác.`)) return;
    const idsToDelete = history
      .filter(h => {
        try {
          const m = JSON.parse(h.metadata || '{}');
          return unitNums.includes(Number(m.unit)) && (m.level === level || (!m.level && level === '?') || (!m.level && !level));
        } catch { return false; }
      })
      .map(h => h.id);

    if (idsToDelete.length === 0) return;

    try {
      const res = await fetch('/api/english', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete })
      });
      if (res.ok) {
        await loadHistory();
      }
    } catch (e) {
      console.error('Delete unit error:', e);
    }
  }

  // legacy (unused by CurriculumTab now, kept for other callers)
  function jumpToLesson(skill: string, level: string, title: string) {
    if (skill === 'listen') { setListenLevel(level); setListenCustomTopic(title); setTab('listen'); }
    else if (skill === 'speak') { setSpkLevel(level); setSpkCustomTopic(title); setTab('speak'); }
    else if (skill === 'read') { setReadLevel(level); setReadCustomTopic(title); setTab('read'); }
    else if (skill === 'write') { setWriteLevel(level); setWriteCustomPrompt(title); setTab('write'); }
    else if (skill === 'grammar') { setGrammarCustomTopic(title); setTab('grammar'); }
    else if (skill === 'vocab') { setVocabTopic(title); setTab('vocab'); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => {
    speechSynthesis.getVoices();
    speechSynthesis.addEventListener('voiceschanged', () => { }, { once: true });
    // Lightweight health check — GET instead of POST synthesis
    fetch('/api/tts?text=__health__', { signal: AbortSignal.timeout(4000) })
      .then(r => r.json()).then(d => setTtsOnline(!!d.available)).catch(() => setTtsOnline(false));
    // Check Whisper
    fetch('/api/stt').then(r => r.json()).catch(() => { });
    // Clear stale tasks (older than 5 mins) on mount
    fetch('/api/ai/task', { method: 'DELETE' }).catch(() => { });
  }, []);

  const activeTaskIds = useRef<Set<string>>(new Set());
  const abortTasks = useRef<Record<string, () => void>>({});

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    let historyData: EngLesson[] = [];
    try {
      const res = await fetch('/api/english');
      const data = await res.json();
      historyData = data.filter((h: any) => !h.type.endsWith('_pending'));
      setHistory(historyData);
    } catch { }
    setHistoryLoading(false);
    return historyData;
  }, []);

  const getGenMessage = useCallback((elapsed: number, action = 'tạo') => {
    return `⏳ AI đang làm...`;
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Tự động load bài mới nhất khi chuyển Tab
  useEffect(() => {
    if (skipAutoLoadRef.current) {
      skipAutoLoadRef.current = false;
      return;
    }
    if (!history.length || !tab) return;

    // Map tab name to database type
    const dbType = tab === 'read' ? 'reading' : tab === 'write' ? 'writing' : tab;

    // Tìm bài mới nhất của tab hiện tại và khớp với mode hiện tại
    const latest = [...history]
      .sort((a, b) => b.id - a.id)
      .find(h => {
        if (h.type !== dbType) return false;
        try {
          const m = JSON.parse(h.metadata || '{}');
          return m.mode === mode;
        } catch { return false; }
      }) || [...history].sort((a, b) => b.id - a.id).find(h => h.type === dbType); // Fallback về bài mới nhất cùng type

    if (!latest) return;

    if (tab === 'listen') {
      try {
        const m = JSON.parse(latest.metadata || '{}');
        setListenText(latest.content);
        setListenVi(m.vi || '');
        setListenVocab(m.vocab || []);
        setListenRecordId(latest.id);
        setListenLevel(m.level || 'A2');
      } catch { }
    } else if (tab === 'speak') {
      try {
        const m = JSON.parse(latest.metadata || '{}');
        setSpkTopic(m.topic || latest.content);
        setSpkSample(m.sample || '');
        setSpkRecordId(latest.id);
        setSpkLevel(m.level || 'A2');
        setTranscript(''); setSpkFeedback('');
      } catch { }
    } else if (tab === 'write') {
      try {
        const m = JSON.parse(latest.metadata || '{}');
        setWritePrompt(m.prompt || latest.content);
        setWriteSample(m.sample || '');
        setWriteRecordId(latest.id);
        setWriteLevel(m.level || 'A2');
        setWriteFeedback(''); setWriteText('');
      } catch { }
    } else if (tab === 'read') {
      try {
        const m = JSON.parse(latest.metadata || '{}');
        setReadArticle({ title: m.title || 'Bài đọc', body: latest.content, wordCount: m.wordCount || 0 });
        setReadRecordId(latest.id);
        setReadLevel(m.level || 'A2');
        setReadQuestions(m.questions || []);
        setReadAnswers([]); setReadSubmitted(false);
      } catch { }
    } else if (tab === 'grammar') {
      try {
        const m = JSON.parse(latest.metadata || '{}');
        setGrammarLesson(latest.content);
        setGrammarRecordId(latest.id);
        setGrammarTopic(m.topic || 'Ngữ pháp');
        // Parse lại quiz answers
        const ans: string[] = [];
        const ms = latest.content.matchAll(/ANSWER:\s*([ABC])/g);
        for (const m of ms) ans.push(m[1]);
        setGrammarQuizAnswers(ans);
        setGrammarUserAnswers(ans.map(() => ''));
        setGrammarSubmitted(false);
      } catch { }
    } else if (tab === 'vocab') {
      try {
        setCards(JSON.parse(latest.content));
        setCardIdx(0); setFlipped(false);
      } catch { }
    }
  }, [tab, mode, history.length]); // Chạy khi tab đổi, mode đổi hoặc history có thêm bài mới

  const markLessonLearned = useCallback(async (lessonId: number, quizScore?: number, quizTotal?: number) => {
    const body: any = { id: lessonId, completed: true, incrementLearnCount: true };
    if (typeof quizScore === 'number' && typeof quizTotal === 'number' && quizTotal > 0) {
      body.quizScore = quizScore;
      body.quizTotal = quizTotal;
    }
    await fetch('/api/english', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    // Nhật ký trang chủ
    const item = history.find(h => h.id === lessonId);
    if (item) {
      let topic = '';
      if (item.type === 'reading') {
        try { topic = '📖 Đọc: ' + (JSON.parse(item.metadata || '{}').title || 'Bài đọc'); } catch { topic = '📖 Bài đọc'; }
      } else if (item.type === 'listen') {
        try {
          const m = JSON.parse(item.metadata || '{}');
          topic = '🎧 Nghe: ' + (m.title || item.content.slice(0, 30) + '...');
        } catch { topic = '🎧 Nghe: ' + item.content.slice(0, 30) + '...'; }
      } else if (item.type === 'speak') {
        try {
          const m = JSON.parse(item.metadata || '{}');
          topic = '🗣️ Nói: ' + (m.topic || item.content.slice(0, 30) + '...');
        } catch { topic = '🗣️ Nói: ' + item.content.slice(0, 30) + '...'; }
      } else if (item.type === 'writing') {
        try { topic = '✍️ Viết: ' + (JSON.parse(item.metadata || '{}').topic || 'Bài viết'); } catch { topic = '✍️ Bài viết'; }
      } else if (item.type === 'vocab') {
        topic = '🗂️ Từ vựng: ' + item.content.slice(0, 30) + '...';
      } else {
        topic = '📚 Học ' + item.type;
      }
      const today = new Date().toLocaleDateString('en-CA');
      fetch('/api/logs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, addTopic: topic })
      });
    }

    skipAutoLoadRef.current = true;
    loadHistory();
  }, [history, loadHistory]);

  const stopTask = useCallback(async (type: string, taskId?: string) => {
    // Clear interval/loop if exists
    if (abortTasks.current[type]) {
      abortTasks.current[type]();
      delete abortTasks.current[type];
    }
    // Delete from DB if taskId provided
    if (taskId) {
      await fetch(`/api/ai/task?taskId=${taskId}&type=${encodeURIComponent(type)}`, { method: 'DELETE' }).catch(() => { });
    }
    // Reset specific loading state
    if (type === 'listen') setListenLoading(false);
    if (type === 'speak') setSpkTopicLoading(false);
    if (type === 'speak_feedback') setSpkLoading(false);
    if (type === 'writing') setWriteTopicLoading(false);
    if (type === 'writing_check') setWriteLoading(false);
    if (type === 'vocab') setVocabLoading(false);
    if (type === 'reading') setReadLoading(false);
    if (type === 'dict') setDictLoading(false);
    if (type === 'speak_sample') setSpkSampleLoading(false);
    if (type === 'writing_sample') setWriteSampleLoading(false);
  }, []);

  async function genBatch() {
    if (batchRunning) { batchStopRef.current = true; return; }
    if (mode === 'all') { alert('Vui lòng chọn mode cụ thể để tạo batch'); return; }
    const batchType = tab === 'write' ? 'writing' : tab === 'read' ? 'reading' : tab;
    if (!['listen', 'speak', 'writing', 'reading', 'vocab', 'grammar'].includes(batchType)) {
      alert('Batch chỉ hỗ trợ tab Nghe, Nói, Viết, Đọc, Từ vựng, Ngữ pháp'); return;
    }
    setBatchRunning(true); batchStopRef.current = false; setBatchMsg('');
    const MAX = 10; let made = 0; const failures: string[] = [];
    let snapshot = [...history];

    for (let i = 0; i < MAX * 3 && made < MAX && !batchStopRef.current; i++) {
      setBatchProgress(`${made + 1}/${MAX}`);
      try {
        const existingTitles = snapshot
          .filter(h => { try { return h.type === batchType && JSON.parse(h.metadata || '{}').mode === mode; } catch { return false; } })
          .map(h => { try { return JSON.parse(h.metadata || '{}').title || JSON.parse(h.metadata || '{}').topic || JSON.parse(h.metadata || '{}').prompt || h.content.slice(0, 40); } catch { return h.content.slice(0, 40); } });
        const avoidStr = existingTitles.length > 0 ? `\n\nAvoid these existing: ${existingTitles.slice(-20).join('; ')}` : '';
        const curLevel = batchType === 'listen' ? listenLevel : batchType === 'speak' ? spkLevel : batchType === 'writing' ? writeLevel : readLevel;
        const mDesc = MODES.find(m2 => m2.id === mode)?.desc || 'developer';
        const cefr = cefrHint(curLevel);

        let content = ''; let meta: Record<string, unknown> = { mode, level: curLevel };

        if (batchType === 'listen') {
          const scenarios = LISTEN_SCENARIOS[mode as keyof typeof LISTEN_SCENARIOS] || LISTEN_SCENARIOS.coder;
          const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
          const p = `Generate a unique English listening exercise (4-6 sentences) for a ${curLevel} learner.\nScenario: ${scenario}\nContext: ${mDesc}${avoidStr}${cefr}\nRequirements: natural English matching ${curLevel}, include 3-4 vocab words, realistic dialogue/monologue.\nReturn JSON ONLY:\n{"title":"...","en":"English text...","vi":"Bản dịch tiếng Việt...","vocab":[{"w":"word","m":"nghĩa"}]}`;
          const raw = await askAI(p, aiModel);
          const m = raw?.match(/\{[\s\S]*\}/);
          if (!m) { failures.push(`lần ${i + 1}: parse lỗi`); continue; }
          const d = JSON.parse(m[0]);
          if (!d.en) { failures.push(`lần ${i + 1}: rỗng`); continue; }
          content = d.en; meta = { title: d.title, vi: d.vi, vocab: d.vocab, topic: scenario, level: curLevel, mode };
        } else if (batchType === 'speak') {
          const p = `Give ONE short English speaking question for ${curLevel} level learner: ${mDesc}.${avoidStr}${cefr}\nReply with the question ONLY.`;
          const t = await askAI(p, aiModel);
          if (!t?.trim()) { failures.push(`lần ${i + 1}: rỗng`); continue; }
          content = ''; meta = { topic: t.trim(), mode, level: curLevel };
        } else if (batchType === 'writing') {
          const p = `Give ONE English writing prompt for ${curLevel} level learner: ${mDesc}.${avoidStr}${cefr}\nReply with the prompt ONLY.`;
          const t = await askAI(p, aiModel);
          if (!t?.trim()) { failures.push(`lần ${i + 1}: rỗng`); continue; }
          content = ''; meta = { prompt: t.trim(), mode, level: curLevel };
        } else if (batchType === 'reading') {
          const topics = READ_TOPICS;
          const topic = topics[Math.floor(Math.random() * topics.length)];
          const wordRange = curLevel === 'A1' ? '50-80' : curLevel === 'A2' ? '80-120' : curLevel === 'B1' ? '150-200' : curLevel === 'B2' ? '200-280' : '280-380';
          const p = `You are an English reading teacher. Create a reading passage for a Vietnamese learner. Context: ${mDesc}.\nLevel: ${curLevel}\nTopic: ${topic}${avoidStr}${cefr}\nReturn JSON ONLY:\n{"title":"...","body":"4-6 paragraphs \\n\\n separated, ${wordRange} words","questions":[{"q":"...","options":["A","B","C","D"],"answer":0},{"q":"...","options":["A","B","C","D"],"answer":2},{"q":"...","options":["A","B","C","D"],"answer":1},{"q":"...","options":["A","B","C","D"],"answer":3}]}`;
          const raw = await askAI(p, aiModel);
          const m = raw?.match(/\{[\s\S]*\}/);
          if (!m) { failures.push(`lần ${i + 1}: parse lỗi`); continue; }
          const d = JSON.parse(m[0]);
          if (!d.body) { failures.push(`lần ${i + 1}: rỗng`); continue; }
          content = d.body; meta = { title: d.title, level: curLevel, topic, questions: d.questions, mode };
        }

        if (batchType === 'vocab') {
          // Vocab: lưu từng từ trong set 10 từ
          const allTopics = [...VOCAB_TOPICS, ...INTERVIEW_VOCAB_TOPICS];
          const topic = allTopics[Math.floor(Math.random() * allTopics.length)];
          const curLevel = listenLevel;
          const existingWords = snapshot.filter(h => h.type === 'vocab').map(h => h.content);
          const avoidW = existingWords.length ? `\nAvoid: ${existingWords.slice(-30).join(', ')}` : '';
          const p = `Give 10 useful English vocabulary words for a ${curLevel} learner. Topic: "${topic}". Context: ${mDesc}${avoidW}${cefrHint(curLevel)}\nReturn JSON array ONLY: [{"word":"...","ipa":"...","def":"short English definition","ex":"Example sentence","vi":"nghĩa tiếng Việt"}]`;
          const raw = await askAI(p, aiModel);
          const mArr = raw?.match(/\[[\s\S]*\]/);
          if (!mArr) { failures.push(`lần ${i + 1}: parse lỗi`); continue; }
          const words = JSON.parse(mArr[0]);
          let wordSaved = 0;
          for (const w of words) {
            const wMeta = { word: w.word, ipa: w.ipa || '', def: w.def, ex: w.ex, vi: w.vi, topic, mode };
            const s = await fetch('/api/english', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'vocab', content: w.word, metadata: wMeta }) }).then(r => r.json());
            if (s?.id) { snapshot = [...snapshot, { ...s, metadata: JSON.stringify(wMeta) }]; wordSaved++; }
          }
          if (wordSaved > 0) made++;
          else failures.push(`lần ${i + 1}: lưu lỗi`);
          continue;
        } else if (batchType === 'grammar') {
          // Grammar: mỗi batch item = 1 bài giảng
          const allTopics = [...GRAMMAR_TOPICS, ...INTERVIEW_GRAMMAR_TOPICS];
          const existingGram = snapshot.filter(h => h.type === 'grammar').map(h => { try { return JSON.parse(h.metadata || '{}').topic || ''; } catch { return ''; } });
          const remaining = allTopics.filter(t => !existingGram.includes(t));
          const topic = remaining.length ? remaining[Math.floor(Math.random() * remaining.length)] : allTopics[Math.floor(Math.random() * allTopics.length)];
          const curLevel = listenLevel;
          const p = `Bạn là giáo viên tiếng Anh. Soạn bài giảng ngữ pháp CHI TIẾT về: "${topic}" (cấp ${curLevel}).\nGiải thích bằng tiếng Việt:\n1. **Khái niệm & Cấu trúc**\n2. **Cách dùng** (2-3 ví dụ thực tế)\n3. **Dùng trong phỏng vấn**: ví dụ câu dùng grammar này khi phỏng vấn\n4. **Quiz** (3 câu):\nQ1: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]\n\nQ2: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]\n\nQ3: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]`;
          const raw = await askAI(p, aiModel);
          if (!raw?.trim()) { failures.push(`lần ${i + 1}: rỗng`); continue; }
          meta = { topic, level: curLevel, mode };
          content = raw;
          const saved = await fetch('/api/english', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'grammar', content, metadata: meta }) }).then(r => r.json());
          if (saved?.id) { snapshot = [...snapshot, { ...saved, metadata: JSON.stringify(meta) }]; made++; }
          else failures.push(`lần ${i + 1}: lưu lỗi`);
          continue;
        }

        const saved = await fetch('/api/english', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: batchType, content, metadata: meta }) }).then(r => r.json());
        if (saved?.id) { snapshot = [...snapshot, { ...saved, metadata: JSON.stringify(meta) }]; made++; }
        else { failures.push(`lần ${i + 1}: lưu lỗi`); }
      } catch (e) { failures.push(`lần ${i + 1}: ${String(e)}`); }
    }

    await loadHistory();
    setBatchRunning(false); setBatchProgress('');
    if (batchStopRef.current) setBatchMsg(`⏸ Đã dừng sau ${made} bài.`);
    else if (failures.length) setBatchMsg(`✅ Tạo ${made} bài. ⚠️ Bỏ qua: ${failures.length} lần.`);
    else setBatchMsg(`✅ Đã tạo ${made} bài tiếng Anh.`);
  }

  // Tạo 1 Bài (Unit) gồm cả 4 kỹ năng cùng chủ đề, theo giáo trình CEFR
  async function genNextUnit() {
    if (batchRunning) { batchStopRef.current = true; return; }
    if (mode === 'all') { alert('Vui lòng chọn mode cụ thể trước'); return; }
    const level = listenLevel;
    const units = UNIT_CURRICULUM[level] || [];
    if (units.length === 0) { alert(`Chưa có giáo trình cho ${level}`); return; }

    // Đếm số unit đã học (theo metadata.unit) trong cùng level + mode
    const doneUnits = new Set<number>();
    for (const h of history) {
      try {
        const m = JSON.parse(h.metadata || '{}');
        if (m.level === level && m.mode === mode && typeof m.unit === 'number') {
          doneUnits.add(curriculumLocalUnitNumber(level, Number(m.unit), Number(m.levelUnit) || undefined));
        }
      } catch { /**/ }
    }
    const nextUnitIdx = units.findIndex((_, i) => !doneUnits.has(i + 1));
    if (nextUnitIdx === -1) { setBatchMsg(`✅ Bạn đã hoàn thành toàn bộ ${units.length} bài cấp ${level} (${mode}).`); return; }

    const levelUnitNum = nextUnitIdx + 1;
    const unitNum = curriculumDisplayUnitNumber(level, levelUnitNum);
    const unit = units[nextUnitIdx];
    setBatchRunning(true); batchStopRef.current = false; setBatchMsg('');
    setBatchProgress(`Bài ${unitNum}: ${unit.title}`);

    const mDesc = MODES.find(m2 => m2.id === mode)?.desc || 'developer';
    const cefr = cefrHint(level);
    const unitCtx = `\n\nĐây là BÀI ${unitNum} của toàn giáo trình, tương ứng ${level} - Bài ${levelUnitNum}.\nChủ đề: ${unit.title}\nGrammar focus: ${unit.grammar}\nVocab focus: ${unit.vocab}\nScenario: ${unit.scenario}`;
    const failures: string[] = [];
    let made = 0;

    type SkillItem = { type: string; build: () => Promise<{ content: string; meta: Record<string, unknown>; multi?: { content: string; meta: Record<string, unknown> }[] } | null> };
    const skills: SkillItem[] = [
      {
        type: 'listen',
        build: async () => {
          const p = `Generate an English listening exercise (4-6 sentences) for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nMUST use the grammar/vocab focus. Realistic dialogue/monologue.\nReturn JSON ONLY:\n{"title":"...","en":"...","vi":"...","vocab":[{"w":"word","m":"nghĩa"}]}`;
          const raw = await askAI(p, aiModel);
          const m = raw?.match(/\{[\s\S]*\}/); if (!m) return null;
          const d = JSON.parse(m[0]); if (!d.en) return null;
          return { content: d.en, meta: { title: `Bài ${unitNum}: ${unit.title} — Nghe`, vi: d.vi, vocab: d.vocab, topic: unit.scenario, level, mode, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title } };
        }
      },
      {
        type: 'speak',
        build: async () => {
          const p = `Give ONE English speaking question for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nQuestion phải khớp scenario & grammar focus.\nReply with the question ONLY.`;
          const t = await askAI(p, aiModel);
          if (!t?.trim()) return null;
          return { content: '', meta: { topic: t.trim(), level, mode, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title, title: `Bài ${unitNum}: ${unit.title} — Nói` } };
        }
      },
      {
        type: 'writing',
        build: async () => {
          const p = `Give ONE English writing prompt for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nPrompt phải khớp scenario.\nReply with the prompt ONLY.`;
          const t = await askAI(p, aiModel);
          if (!t?.trim()) return null;
          return { content: '', meta: { prompt: t.trim(), level, mode, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title, title: `Bài ${unitNum}: ${unit.title} — Viết` } };
        }
      },
      {
        type: 'reading',
        build: async () => {
          const wordRange = level === 'A1' ? '50-80' : level === 'A2' ? '80-120' : level === 'B1' ? '150-200' : level === 'B2' ? '200-280' : '280-380';
          const p = `Create an English reading passage for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nMUST use the grammar/vocab focus.\nReturn JSON ONLY:\n{"title":"...","body":"4-6 paragraphs \\n\\n separated, ${wordRange} words","questions":[{"q":"...","options":["A","B","C","D"],"answer":0},{"q":"...","options":["A","B","C","D"],"answer":2},{"q":"...","options":["A","B","C","D"],"answer":1},{"q":"...","options":["A","B","C","D"],"answer":3}]}`;
          const raw = await askAI(p, aiModel);
          const m = raw?.match(/\{[\s\S]*\}/); if (!m) return null;
          const d = JSON.parse(m[0]); if (!d.body) return null;
          return { content: d.body, meta: { title: `Bài ${unitNum}: ${unit.title} — Đọc`, level, topic: unit.scenario, questions: d.questions, mode, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title } };
        }
      },
      {
        // Từ vựng — 10 từ theo vocab focus của bài, lưu từng từ riêng để "nhả ra từng từ" trong lịch sử
        type: 'vocab',
        build: async () => {
          const p = `Give 10 useful English vocabulary words for a ${level} learner. Topic: "${unit.vocab}". Context: ${mDesc}.${unitCtx}\nFocus on words that appear in this unit's grammar/scenario.\nReturn JSON array ONLY: [{"word":"...","ipa":"...","def":"short English definition","ex":"Example sentence using the grammar focus","vi":"nghĩa tiếng Việt"}]`;
          const raw = await askAI(p, aiModel);
          const m = raw?.match(/\[[\s\S]*\]/); if (!m) return null;
          const words = JSON.parse(m[0]);
          if (!words?.length) return null;
          return {
            content: words[0].word,
            meta: { word: words[0].word, ipa: words[0].ipa, def: words[0].def, ex: words[0].ex, vi: words[0].vi, topic: unit.vocab, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title, mode, level },
            multi: words.map((w: any) => ({ content: w.word, meta: { word: w.word, ipa: w.ipa || '', def: w.def, ex: w.ex, vi: w.vi, topic: unit.vocab, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title, mode, level } }))
          };
        }
      },
      {
        // Ngữ pháp — bài giảng về grammar focus của unit
        type: 'grammar',
        build: async () => {
          const gramFocus = unit.grammar;
          const p = `Bạn là giáo viên tiếng Anh. Soạn bài giảng ngữ pháp CHI TIẾT về: "${gramFocus}" (cấp ${level}).\nNgữ cảnh ứng dụng: ${unit.scenario}.\n\nGiải thích bằng tiếng Việt, ngắn gọn:\n1. **Khái niệm & Cấu trúc**: Công thức + ví dụ.\n2. **Cách dùng trong ${unit.title}**: 2-3 câu ví dụ thực tế với scenario.\n3. **Phỏng vấn**: Cách dùng grammar này khi phỏng vấn xin việc.\n4. **Quiz** (3 câu):\nQ1: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]\n\nQ2: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]\n\nQ3: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]`;
          const raw = await askAI(p, aiModel);
          if (!raw?.trim()) return null;
          return { content: raw, meta: { topic: `Bài ${unitNum}: ${unit.title} — Ngữ pháp: ${gramFocus}`, level, mode, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title } };
        }
      },
    ];

    const TOTAL = 6;
    for (const skill of skills) {
      if (batchStopRef.current) break;
      setBatchProgress(`Bài ${unitNum} — ${skill.type}`);
      try {
        const r = await skill.build();
        if (!r) { failures.push(skill.type); continue; }
        const items = (r as any).multi || [{ content: r.content, meta: r.meta }];
        for (const item of items) {
          const saved = await fetch('/api/english', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: skill.type, content: item.content, metadata: item.meta })
          }).then(res => res.json());
          if (saved?.id) made++;
        }
      } catch (e) { failures.push(`${skill.type}: ${String(e)}`); }
    }

    await loadHistory();
    setBatchRunning(false); setBatchProgress('');
    if (batchStopRef.current) setBatchMsg(`⏸ Đã dừng. Tạo ${made}/${TOTAL} mục cho Bài ${unitNum}.`);
    else if (failures.length) setBatchMsg(`✅ Bài ${unitNum} (${unit.title}): ${made} mục (6 kỹ năng). Lỗi: ${failures.join(', ')}`);
    else setBatchMsg(`✅ Bài ${unitNum}: ${unit.title} — đủ 6 kỹ năng (Nghe/Nói/Viết/Đọc + 10 từ vựng + Ngữ pháp).`);
  }

  // Tạo 10 bài liên tục (mỗi bài đủ 6 kỹ năng)
  async function gen10Units() {
    if (batchRunning) { batchStopRef.current = true; return; }
    if (mode === 'all') { alert('Vui lòng chọn mode cụ thể trước'); return; }
    const level = listenLevel;
    const units = UNIT_CURRICULUM[level] || [];
    if (units.length === 0) { alert(`Chưa có giáo trình cho ${level}`); return; }

    setBatchRunning(true); batchStopRef.current = false; setBatchMsg('');
    let totalMade = 0;
    let unitsMade = 0;

    let currentHistory = history;

    for (let round = 0; round < 10 && !batchStopRef.current; round++) {
      // Tìm unit tiếp theo chưa học
      const doneUnits = new Set<number>();
      for (const h of currentHistory) {
        try {
          const m = JSON.parse(h.metadata || '{}');
          if (m.level === level && m.mode === mode && typeof m.unit === 'number') {
            doneUnits.add(curriculumLocalUnitNumber(level, Number(m.unit), Number(m.levelUnit) || undefined));
          }
        } catch { /**/ }
      }
      const nextUnitIdx = units.findIndex((_, i) => !doneUnits.has(i + 1));
      if (nextUnitIdx === -1) { setBatchMsg(`✅ Đã hoàn thành toàn bộ ${units.length} bài cấp ${level}. Tạo ${unitsMade} bài mới.`); break; }

      const levelUnitNum = nextUnitIdx + 1;
      const unitNum = curriculumDisplayUnitNumber(level, levelUnitNum);
      const unit = units[nextUnitIdx];
      setBatchProgress(`Bài ${unitNum}/${Math.min(unitsMade + 10, units.length)}: ${unit.title}`);

      const mDesc = MODES.find(m2 => m2.id === mode)?.desc || 'developer';
      const cefr = cefrHint(level);
      const unitCtx = `\n\nĐây là BÀI ${unitNum} của toàn giáo trình, tương ứng ${level} - Bài ${levelUnitNum}.\nChủ đề: ${unit.title}\nGrammar focus: ${unit.grammar}\nVocab focus: ${unit.vocab}\nScenario: ${unit.scenario}`;

      const skills = [
        { type: 'listen', build: async () => { const p = `Generate an English listening exercise (4-6 sentences) for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nMUST use the grammar/vocab focus. Realistic dialogue/monologue.\nReturn JSON ONLY:\n{"title":"...","en":"...","vi":"...","vocab":[{"w":"word","m":"nghĩa"}]}`; const raw = await askAI(p, aiModel); const m = raw?.match(/\{[\s\S]*\}/); if (!m) return null; const d = JSON.parse(m[0]); if (!d.en) return null; return { content: d.en, meta: { title: `Bài ${unitNum}: ${unit.title} — Nghe`, vi: d.vi, vocab: d.vocab, topic: unit.scenario, level, mode, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title } }; } },
        { type: 'speak', build: async () => { const p = `Give ONE English speaking question for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nQuestion phải khớp scenario & grammar focus.\nReply with the question ONLY.`; const t = await askAI(p, aiModel); if (!t?.trim()) return null; return { content: '', meta: { topic: t.trim(), level, mode, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title, title: `Bài ${unitNum}: ${unit.title} — Nói` } }; } },
        { type: 'writing', build: async () => { const p = `Give ONE English writing prompt for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nPrompt phải khớp scenario.\nReply with the prompt ONLY.`; const t = await askAI(p, aiModel); if (!t?.trim()) return null; return { content: '', meta: { prompt: t.trim(), level, mode, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title, title: `Bài ${unitNum}: ${unit.title} — Viết` } }; } },
        { type: 'reading', build: async () => { const wordRange = level === 'A1' ? '50-80' : level === 'A2' ? '80-120' : level === 'B1' ? '150-200' : level === 'B2' ? '200-280' : '280-380'; const p = `Create an English reading passage for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nMUST use the grammar/vocab focus.\nReturn JSON ONLY:\n{"title":"...","body":"4-6 paragraphs \\n\\n separated, ${wordRange} words","questions":[{"q":"...","options":["A","B","C","D"],"answer":0},{"q":"...","options":["A","B","C","D"],"answer":2},{"q":"...","options":["A","B","C","D"],"answer":1},{"q":"...","options":["A","B","C","D"],"answer":3}]}`; const raw = await askAI(p, aiModel); const m = raw?.match(/\{[\s\S]*\}/); if (!m) return null; const d = JSON.parse(m[0]); if (!d.body) return null; return { content: d.body, meta: { title: `Bài ${unitNum}: ${unit.title} — Đọc`, level, topic: unit.scenario, questions: d.questions, mode, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title } }; } },
        { type: 'vocab', build: async () => { const p = `Give 10 useful English vocabulary words for a ${level} learner. Topic: "${unit.vocab}". Context: ${mDesc}.${unitCtx}\nFocus on words that appear in this unit's grammar/scenario.\nReturn JSON array ONLY: [{"word":"...","ipa":"...","def":"short English definition","ex":"Example sentence using the grammar focus","vi":"nghĩa tiếng Việt"}]`; const raw = await askAI(p, aiModel); const m = raw?.match(/\[[\s\S]*\]/); if (!m) return null; const words = JSON.parse(m[0]); if (!words?.length) return null; return { content: words[0].word, meta: { word: words[0].word, ipa: words[0].ipa, def: words[0].def, ex: words[0].ex, vi: words[0].vi, topic: unit.vocab, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title, mode, level }, multi: words.map((w: any) => ({ content: w.word, meta: { word: w.word, ipa: w.ipa || '', def: w.def, ex: w.ex, vi: w.vi, topic: unit.vocab, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title, mode, level } })) }; } },
        { type: 'grammar', build: async () => { const gramFocus = unit.grammar; const p = `Bạn là giáo viên tiếng Anh. Soạn bài giảng ngữ pháp CHI TIẾT về: "${gramFocus}" (cấp ${level}).\nNgữ cảnh ứng dụng: ${unit.scenario}.\n\nGiải thích bằng tiếng Việt, ngắn gọn:\n1. **Khái niệm & Cấu trúc**: Công thức + ví dụ.\n2. **Cách dùng trong ${unit.title}**: 2-3 câu ví dụ thực tế với scenario.\n3. **Phỏng vấn**: Cách dùng grammar này khi phỏng vấn xin việc.\n4. **Quiz** (3 câu):\nQ1: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]\n\nQ2: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]\n\nQ3: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]`; const raw = await askAI(p, aiModel); if (!raw?.trim()) return null; return { content: raw, meta: { topic: `Bài ${unitNum}: ${unit.title} — Ngữ pháp: ${gramFocus}`, level, mode, unit: unitNum, levelUnit: levelUnitNum, unitTitle: unit.title } }; } },
      ];

      for (const skill of skills) {
        if (batchStopRef.current) break;
        setBatchProgress(`Bài ${unitNum} — ${skill.type}`);
        try {
          const r = await skill.build();
          if (!r) continue;
          const items = (r as any).multi || [{ content: r.content, meta: r.meta }];
          for (const item of items) {
            const saved = await fetch('/api/english', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: skill.type, content: item.content, metadata: item.meta })
            }).then(res => res.json());
            if (saved?.id) totalMade++;
          }
        } catch { /**/ }
      }
      unitsMade++;
      currentHistory = await loadHistory();
    }

    setBatchRunning(false); setBatchProgress('');
    if (batchStopRef.current) setBatchMsg(`⏸ Đã dừng sau ${unitsMade} bài.`);
    else setBatchMsg(`✅ Đã tạo ${unitsMade} bài (${totalMade} mục) đủ 6 kỹ năng.`);
  }

  // LISTEN
  async function genListenText() {
    if (mode === 'all') {
      alert('Vui lòng chọn mode cụ thể (Coder, Giao tiếp, Công việc, IELTS) để tạo bài mới');
      return;
    }
    setListenLoading(true); setListenVi(''); setListenVocab([]); setShowListenVi(false);

    // Lấy TẤT CẢ bài cùng mode để tránh trùng
    const existingListens = history
      .filter(h => {
        if (h.type !== 'listen') return false;
        try {
          const itemMode = JSON.parse(h.metadata || '{}').mode || 'coder';
          return itemMode === mode;
        } catch {
          return false;
        }
      })
      .map(h => {
        try {
          return JSON.parse(h.metadata || '{}').title || h.content.slice(0, 40);
        } catch {
          return h.content.slice(0, 40);
        }
      });

    // Nếu có custom topic, dùng nó; nếu không thì chọn scenario ngẫu nhiên
    let scenario = '';
    if (listenCustomTopic.trim()) {
      scenario = listenCustomTopic.trim();
    } else {
      const scenarios = LISTEN_SCENARIOS[mode as keyof typeof LISTEN_SCENARIOS] || LISTEN_SCENARIOS.coder;
      scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    }

    const avoidList = existingListens.length > 0
      ? `\nAvoid these existing topics: ${existingListens.join('; ')}`
      : '';

    const p = `Generate a unique English listening exercise (4-6 sentences) for a ${listenLevel} learner.

Scenario: ${scenario}
${selectedUnit ? `Lesson: ${selectedUnit} - ${selectedUnitTitle}` : ''}
Context: ${modeDesc}${avoidList}${cefrHint(listenLevel)}

Requirements:
- Natural conversational English MATCHING ${listenLevel} grammar/vocab
- Include 3-4 useful vocabulary words appropriate for ${listenLevel}
- Different situation from existing exercises
- Realistic dialogue or monologue

Return JSON format ONLY:
{
  "title": "A short descriptive title (different from existing ones)",
  "en": "English text...",
  "vi": "Bản dịch tiếng Việt...",
  "vocab": [{"w": "từ/cụm từ", "m": "nghĩa & cách dùng"}]
}`;
    try {
      const raw = await askAI(p, aiModel);
      try {
        const m = extractJsonObject(raw);
        if (m) {
          const d = JSON.parse(m);
          if (!d.en) throw new Error('JSON thiếu trường en');
          setListenText(d.en || '');
          setListenVi(d.vi || '');
          setListenVocab(d.vocab || []);
          const d2 = await saveToDb('listen', d.en, { title: d.title, vi: d.vi, vocab: d.vocab, topic: scenario, level: listenLevel, unit: selectedUnit, unitTitle: selectedUnitTitle }, mode);
          if (d2?.id) {
            setListenRecordId(d2.id);
            loadHistory();
          }
        } else {
          throw new Error('AI không trả JSON hợp lệ');
        }
      } catch (e) {
        throw new Error(`Không đọc được bài nghe AI: ${errorText(e)}`);
      }
      setListenCustomTopic(''); // Clear custom topic sau khi dùng
      loadHistory();
    } catch (e) {
      alert('Lỗi tạo bài nghe: ' + errorText(e));
    } finally {
      setListenLoading(false);
    }
  }

  async function playText(text = listenText) {
    if (!text || playing) return;
    setPlaying(true);
    const loop = text === listenText;
    do {
      await speak(text, globalSpeed, globalVoice, globalTtsProvider);
      if (loop && listenLoopingRef.current) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } while (loop && listenLoopingRef.current);
    setPlaying(false);
  }

  function stopPlayText() {
    setPlaying(false);
    setListenLooping(false);
    listenLoopingRef.current = false;
    stopTTS();
  }

  // SPEAK
  async function genSpkTopic() {
    if (mode === 'all') {
      alert('Vui lòng chọn mode cụ thể (Coder, Giao tiếp, Công việc, IELTS) để tạo bài mới');
      return;
    }
    setSpkTopicLoading(true); setSpkTopicError('');
    try {
      // Nếu có custom topic, dùng nó để tạo câu hỏi tiếng Anh
      if (spkCustomTopic.trim()) {
        const p = `Translate this Vietnamese topic into a natural English speaking question for ${spkLevel} level learner: "${spkCustomTopic.trim()}"

Reply with the English question ONLY, no explanation.`;
        const t = await askAI(p, aiModel);
        const clean = cleanTopic(t);
        if (!clean) throw new Error('AI trả về chủ đề rỗng');
        setSpkTopic(clean);
        setTranscript(''); setSpkFeedback(''); setSpkSample('');
        setSpkCustomTopic(''); // Clear sau khi dùng
        // Lưu chủ đề mới
        fetch('/api/english', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'speak', content: '', metadata: { topic: clean, mode, level: spkLevel, unit: selectedUnit, unitTitle: selectedUnitTitle } }),
        }).then(r => r.json()).then(d => { setSpkRecordId(d.id); loadHistory(); }).catch(() => setSpkRecordId(null));
        return;
      }

      // Lấy TẤT CẢ chủ đề speaking cùng mode
      const existingTopics = history
        .filter(h => {
          if (h.type !== 'speak') return false;
          try {
            const itemMode = JSON.parse(h.metadata || '{}').mode || 'coder';
            return itemMode === mode;
          } catch {
            return false;
          }
        })
        .map(h => {
          try {
            return JSON.parse(h.metadata || '{}').topic || h.content.slice(0, 50);
          } catch {
            return h.content.slice(0, 50);
          }
        });

      const avoidList = existingTopics.length > 0
        ? `\n\nAvoid these existing topics:\n${existingTopics.join('\n')}`
        : '';

      const p = `Give ONE short English speaking question for ${spkLevel} level learner: ${modeDesc}.${selectedUnit ? ` Lesson: ${selectedUnit} - ${selectedUnitTitle}.` : ''}${avoidList}${cefrHint(spkLevel)}

Question phải dùng grammar/vocab chuẩn ${spkLevel}, không quá khó cũng không quá dễ.
Reply with the question ONLY, no explanation.`;
      const t = await askAI(p, aiModel);
      const clean = cleanTopic(t);
      if (!clean) throw new Error('AI trả về chủ đề rỗng');
      setSpkTopic(clean);
      setTranscript(''); setSpkFeedback(''); setSpkSample('');
      // Lưu chủ đề mới (Chỉ 1 bản ghi)
      fetch('/api/english', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'speak', content: '', metadata: { topic: clean, mode, level: spkLevel } }),
      }).then(r => r.json()).then(d => { setSpkRecordId(d.id); loadHistory(); }).catch(() => setSpkRecordId(null));
    } catch (e) {
      setSpkTopicError('Lỗi tạo bài nói: ' + errorText(e));
    } finally {
      setSpkTopicLoading(false);
    }
  }

  async function genSpkSample() {
    setSpkSampleLoading(true);
    try {
      const directionText = spkSampleDirection.trim()
        ? `\n\nĐịnh hướng trả lời: ${spkSampleDirection.trim()}`
        : '';
      const raw = await askAI(`Answer this English question at ${spkLevel} level in 3-4 natural sentences: "${spkTopic}"${directionText}${cefrHint(spkLevel)}

**English:** (3-4 sentences, grammar & vocab phải đúng chuẩn ${spkLevel})
**Tiếng Việt:** (bản dịch ngắn)
**Từ hay:** word1 – nghĩa, word2 – nghĩa`, aiModel);
      setSpkSample(raw || '');
      if (spkRecordId) {
        fetch('/api/english', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: spkRecordId, metadata: { topic: spkTopic, sample: raw || '', mode, level: spkLevel, unit: selectedUnit, unitTitle: selectedUnitTitle } }),
        }).catch(() => { });
      }
    } catch (e) {
      setSpkTopicError('Lỗi tạo bài mẫu: ' + errorText(e));
    } finally {
      setSpkSampleLoading(false);
    }
  }

  async function genWriteSample() {
    setWriteSampleLoading(true);
    try {
      const directionText = writeSampleDirection.trim()
        ? `\n\nĐịnh hướng viết: ${writeSampleDirection.trim()}`
        : '';
      const raw = await askAI(`Write a concise sample response at ${writeLevel} level (80-120 words) for: "${writePrompt}"${directionText}${cefrHint(writeLevel)}

**English:** (1-2 clear paragraphs)
**Tiếng Việt:** (bản dịch ngắn)
**Từ hay:** word1 – nghĩa, word2 – nghĩa`, aiModel);
      setWriteSample(raw || '');
      if (writeRecordId) {
        fetch('/api/english', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: writeRecordId, metadata: { prompt: writePrompt, sample: raw || '', mode, level: writeLevel, unit: selectedUnit, unitTitle: selectedUnitTitle } }),
        }).catch(() => { });
      }
    } catch (e) {
      setWriteTopicError('Lỗi tạo bài mẫu: ' + errorText(e));
    } finally {
      setWriteSampleLoading(false);
    }
  }

  async function startRec() {
    setRecognizing(true); setSttStatus('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          sampleRate: { ideal: 44100 },
          channelCount: { ideal: 1 }
        }
      });
      chunksRef.current = [];
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg', ''].find(m => !m || MediaRecorder.isTypeSupported(m)) || '';
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setSttStatus('⏳ Whisper đang nhận dạng...');
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });

        let ext = 'webm';
        if (mr.mimeType.includes('mp4')) ext = 'mp4';
        else if (mr.mimeType.includes('ogg')) ext = 'ogg';
        else if (mr.mimeType.includes('wav')) ext = 'wav';

        const form = new FormData();
        form.append('audio', blob, `audio.${ext}`);
        form.append('language', 'en');
        form.append('prompt', 'English conversation practice, focus on English grammar and vocabulary.');
        const res = await fetch('/api/stt', { method: 'POST', body: form });
        const data = await res.json();
        if (data.text) { setTranscript(data.text); setSttStatus(''); }
        else { setSttStatus('❌ Lỗi nhận dạng — thử lại'); }
        setRecognizing(false);
      };
      mr.start();
      mediaRecRef.current = mr;
    } catch { setSttStatus('❌ Không truy cập được mic'); setRecognizing(false); }
  }

  function stopRec() {
    mediaRecRef.current?.stop();
  }
  async function getFeedback() {
    if (!transcript) return;
    setSpkLoading(true);
    try {
      const p = `Bạn là giáo viên tiếng Anh chuyên nghiệp. Hãy chấm điểm bài nói sau trên thang điểm 100 và nhận xét chi tiết cho học viên trình độ ${spkLevel}.
    Chủ đề: "${spkTopic}"
    Bài nói của học viên: "${transcript}"

    Hãy trình bày theo định dạng Markdown sau:
    # Điểm số: [Số điểm]/100
    ---
    ## Nhận xét chi tiết
    ### 1. Ngữ pháp & Phát âm:
    (Nhận xét lỗi cụ thể)
    ### 2. Từ vựng & Độ tự nhiên:
    (Nhận xét về từ ngữ)
    ---
    ## Gợi ý nói lại (English)
    **"Câu tiếng Anh hoàn chỉnh và tự nhiên hơn"**
    ---
    ## Dịch sang tiếng Việt
    > Bản dịch của câu gợi ý.`;
      const fb = await askAI(p);
      setSpkFeedback(fb);
      skipAutoLoadRef.current = true;
      if (spkRecordId) {
        await fetch('/api/english', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: spkRecordId, content: transcript, metadata: { topic: spkTopic, feedback: fb, sample: spkSample, mode, level: spkLevel } }),
        });
        loadHistory();
      } else {
        const d2 = await saveToDb('speak', transcript, { topic: spkTopic, feedback: fb, sample: spkSample, level: spkLevel }, mode);
        if (d2?.id) { setSpkRecordId(d2.id); loadHistory(); }
      }
    } catch (e) {
      setSpkFeedback('Lỗi chấm bài nói: ' + errorText(e));
    } finally {
      setSpkLoading(false);
    }
  }

  // WRITE
  async function genWriteTopic() {
    if (mode === 'all') {
      alert('Vui lòng chọn mode cụ thể (Coder, Giao tiếp, Công việc, IELTS) để tạo bài mới');
      return;
    }
    setWriteTopicLoading(true); setWriteTopicError('');
    try {
      // Nếu có custom prompt, dùng nó để tạo đề viết tiếng Anh
      if (writeCustomPrompt.trim()) {
        const p = `Translate this Vietnamese writing topic into a natural English writing prompt for ${writeLevel} level learner: "${writeCustomPrompt.trim()}"

Reply with the English prompt ONLY, no explanation.`;
        const t = await askAI(p, aiModel);
        const clean = cleanTopic(t);
        if (!clean) throw new Error('AI trả về đề viết rỗng');
        setWritePrompt(clean);
        setWriteText(''); setWriteFeedback(''); setWriteSample('');
        setWriteCustomPrompt(''); // Clear sau khi dùng
        // Lưu chủ đề mới
        fetch('/api/english', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'writing', content: '', metadata: { prompt: clean, mode, level: writeLevel, unit: selectedUnit, unitTitle: selectedUnitTitle } }),
        }).then(r => r.json()).then(d => { setWriteRecordId(d.id); loadHistory(); }).catch(() => setWriteRecordId(null));
        return;
      }

      // Lấy TẤT CẢ đề viết cùng mode
      const existingPrompts = history
        .filter(h => {
          if (h.type !== 'writing') return false;
          try {
            const itemMode = JSON.parse(h.metadata || '{}').mode || 'coder';
            return itemMode === mode;
          } catch {
            return false;
          }
        })
        .map(h => {
          try {
            return JSON.parse(h.metadata || '{}').prompt || h.content.slice(0, 50);
          } catch {
            return h.content.slice(0, 50);
          }
        });

      const avoidList = existingPrompts.length > 0
        ? `\n\nAvoid these existing prompts:\n${existingPrompts.join('\n')}`
        : '';

      const p = `Give ONE English writing prompt for ${writeLevel} level learner: ${modeDesc}.${selectedUnit ? ` Lesson: ${selectedUnit} - ${selectedUnitTitle}.` : ''}${avoidList}${cefrHint(writeLevel)}

Prompt phù hợp với grammar/vocab chuẩn ${writeLevel}.
Reply with the prompt ONLY.`;
      const t = await askAI(p, aiModel);
      const clean = cleanTopic(t);
      if (!clean) throw new Error('AI trả về đề viết rỗng');
      setWritePrompt(clean);
      setWriteText(''); setWriteFeedback(''); setWriteSample('');
      // Lưu chủ đề mới (Chỉ 1 bản ghi)
      fetch('/api/english', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'writing', content: '', metadata: { prompt: clean, mode, level: writeLevel } }),
      }).then(r => r.json()).then(d => { setWriteRecordId(d.id); loadHistory(); }).catch(() => setWriteRecordId(null));
    } catch (e) {
      setWriteTopicError('Lỗi tạo đề viết: ' + errorText(e));
    } finally {
      setWriteTopicLoading(false);
    }
  }

  async function checkWriting() {
    if (!writeText.trim()) return;
    setWriteLoading(true);
    try {
      const p = `Check this English writing for a ${writeLevel} level learner. Topic: "${writePrompt}". Text: "${writeText}"

Reply in Markdown (concise):
**Lỗi chính:** (tối đa 4 bullets về grammar/vocab)
**Viết lại đẹp hơn (English):** (1-2 câu tự nhiên hơn)
**Dịch:** (bản dịch tiếng Việt của phần viết lại)`;
      const fb = await askAI(p);
      setWriteFeedback(fb);
      skipAutoLoadRef.current = true;
      if (writeRecordId) {
        await fetch('/api/english', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: writeRecordId, content: writeText, metadata: { prompt: writePrompt, feedback: fb, sample: writeSample, words: writeText.split(/\s+/).filter(Boolean).length, mode, level: writeLevel } }),
        });
        loadHistory();
      } else {
        const d2 = await saveToDb('writing', writeText, { prompt: writePrompt, feedback: fb, sample: writeSample, words: writeText.split(/\s+/).filter(Boolean).length, level: writeLevel }, mode);
        if (d2?.id) { setWriteRecordId(d2.id); loadHistory(); }
      }
    } catch (e) {
      setWriteFeedback('Lỗi chấm bài viết: ' + errorText(e));
    } finally {
      setWriteLoading(false);
    }
  }

  // VOCAB
  async function loadVocab() {
    if (mode === 'all') {
      alert('Vui lòng chọn mode cụ thể (Coder, Giao tiếp, Công việc, IELTS) để tạo bài mới');
      return;
    }
    setVocabLoading(true); setCards([]); setCardIdx(0); setFlipped(false); setKnown([]);

    // Lấy TẤT CẢ từ vựng cùng mode và topic
    const existingWords = history
      .filter(h => {
        if (h.type !== 'vocab') return false;
        try {
          const meta = JSON.parse(h.metadata || '{}');
          const itemMode = meta.mode || 'coder';
          const itemTopic = meta.topic || '';
          return itemMode === mode && itemTopic === vocabTopic;
        } catch {
          return false;
        }
      })
      .map(h => h.content);

    const avoidList = existingWords.length > 0
      ? `\n\nAvoid these existing words:\n${existingWords.join(', ')}`
      : '';

    const p = `Give 10 unique, varied and useful English vocabulary words for a Vietnamese learner. Context: ${modeDesc}. Topic: ${vocabTopic}. ${selectedUnit ? `Lesson: ${selectedUnit} - ${selectedUnitTitle}. ` : ''}Avoid common words like 'variable' or 'function' unless the topic specifically requires them.${avoidList}

Return JSON array ONLY: [{"word":"...","ipa":"IPA pronunciation","def":"short English definition","ex":"Example sentence","vi":"Vietnamese meaning"}]`;
    try {
      const raw = await askAI(p, aiModel);
      const m = extractJsonArray(raw);
      if (m) {
        const parsed = JSON.parse(m);
        setCards(parsed);
        // Lưu từng từ riêng biệt thay vì lưu cả nhóm
        for (const item of parsed) {
          await saveToDb('vocab', item.word, {
            ipa: item.ipa || '',
            def: item.def,
            ex: item.ex,
            vi: item.vi,
            topic: vocabTopic,
            level: level,
            unit: selectedUnit,
            unitTitle: selectedUnitTitle
          }, mode);
        }
      } else {
        throw new Error('AI không trả JSON array hợp lệ');
      }
      loadHistory();
    } catch (e) {
      alert('Lỗi tạo từ vựng: ' + errorText(e));
    } finally {
      setVocabLoading(false);
    }
  }

  const wordCount = writeText.split(/\s+/).filter(Boolean).length;
  async function generateReading() {
    if (mode === 'all') {
      alert('Vui lòng chọn mode cụ thể (Coder, Giao tiếp, Công việc, IELTS) để tạo bài mới');
      return;
    }
    setReadLoading(true); setReadError('');
    setReadArticle(null); setReadQuestions([]); setReadAnswers([]); setReadSubmitted(false);
    setReadSelected(''); setReadLookup(''); setReadChat([]);

    // Nếu có custom topic, dùng nó
    let topicToUse = readTopic;
    if (readCustomTopic.trim()) {
      topicToUse = readCustomTopic.trim();
      setReadTopic(topicToUse);
      setReadCustomTopic(''); // Clear sau khi dùng
    }

    // Lấy TẤT CẢ bài đọc cùng mode, level, topic
    const existingArticles = history
      .filter(h => {
        if (h.type !== 'reading') return false;
        try {
          const meta = JSON.parse(h.metadata || '{}');
          const itemMode = meta.mode || 'coder';
          const itemLevel = meta.level || 'A2';
          const itemTopic = meta.topic || '';
          return itemMode === mode && itemLevel === readLevel && itemTopic === topicToUse;
        } catch {
          return false;
        }
      })
      .map(h => {
        try {
          return JSON.parse(h.metadata || '{}').title || h.content.slice(0, 50);
        } catch {
          return h.content.slice(0, 50);
        }
      });

    const avoidList = existingArticles.length > 0
      ? `\n\nAvoid these existing articles:\n${existingArticles.join('\n')}`
      : '';

    const wordRange = readLevel === 'A1' ? '50-80' : readLevel === 'A2' ? '80-120' : readLevel === 'B1' ? '150-200' : readLevel === 'B2' ? '200-280' : '280-380';
    const p = `You are an English reading teacher. Create a reading passage for a Vietnamese learner. Context: ${modeDesc}.
Level: ${readLevel}
Topic: ${topicToUse}${selectedUnit ? `\nLesson: ${selectedUnit} - ${selectedUnitTitle}` : ''}${avoidList}${cefrHint(readLevel)}

Return JSON ONLY (no markdown code blocks, just raw json):
{"title":"...","body":"4-6 paragraphs separated by \\n\\n, ${wordRange} words, grammar/vocab đúng chuẩn ${readLevel}","questions":[{"q":"...","options":["A","B","C","D"],"answer":0},{"q":"...","options":["A","B","C","D"],"answer":2},{"q":"...","options":["A","B","C","D"],"answer":1},{"q":"...","options":["A","B","C","D"],"answer":3}]}`;

    try {
      const raw = await askAI(p, aiModel);
      const m = extractJsonObject(raw);
      if (m) {
        const parsed = JSON.parse(m);
        if (parsed.title && parsed.body) {
          setReadArticle({ title: parsed.title, body: parsed.body, wordCount: parsed.body.split(/\s+/).length });
          setReadQuestions(parsed.questions || []);
          setReadAnswers((parsed.questions || []).map(() => -1));
          const saved = await saveToDb('reading', parsed.body, { title: parsed.title, level: readLevel, topic: topicToUse, questions: parsed.questions, unit: selectedUnit, unitTitle: selectedUnitTitle }, mode);
          if (saved) setReadRecordId(saved.id);
        }
      } else {
        throw new Error('AI không trả JSON hợp lệ');
      }
      loadHistory();
    } catch (e) {
      setReadError('Lỗi tạo bài đọc: ' + errorText(e));
    } finally {
      setReadLoading(false);
    }
  }

  async function readLookupFn() {
    if (!readSelected.trim() || readLookupLoading) return;
    setReadLookupLoading(true); setReadLookup('');
    try {
      const isShort = readSelected.trim().split(/\s+/).length <= 3;
      const res = await askAI(isShort
        ? `Giải thích từ/cụm "${readSelected}" trong ngữ cảnh bài đọc về "${readTopic}". Tiếng Việt: nghĩa, phiên âm, ví dụ. Dưới 60 từ.`
        : `Dịch và giải thích câu này sang tiếng Việt: "${readSelected}". Ngắn gọn.`, aiModel);
      setReadLookup(res || 'Lỗi: AI không phản hồi');
    } catch (e) {
      setReadLookup('Lỗi: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setReadLookupLoading(false);
    }
  }

  async function sendReadChat() {
    if (!readChatInput.trim() || readChatLoading || !readArticle) return;
    const q = readChatInput.trim();
    setReadChat(l => [...l, { role: 'user', text: q }]); setReadChatInput(''); setReadChatLoading(true);
    try {
      const res = await askAI(`Bài đọc: "${readArticle.title}"\n\n${readArticle.body}\n\nHọc viên hỏi: ${q}\nTrả lời tiếng Việt, ngắn gọn.`);
      setReadChat(l => [...l, { role: 'ai', text: res }]);
    } catch (e) {
      setReadChat(l => [...l, { role: 'ai', text: 'Lỗi AI: ' + errorText(e) }]);
    } finally {
      setReadChatLoading(false);
    }
  }

  const readScore = readSubmitted ? readAnswers.filter((a, i) => a === readQuestions[i]?.answer).length : 0;

  // DICT
  async function lookupWord() {
    const w = dictInput.trim();
    if (!w || dictLoading) return;
    setDictLoading(true); setDictResult('');
    const isPhrase = w.split(/\s+/).length > 3;
    const p = isPhrase
      ? `Giải thích cụm từ/câu tiếng Anh: "${w}". Trả lời Markdown:\n# ${w}\n## Nghĩa tiếng Việt\n## Ví dụ`
      : `Tra từ tiếng Anh: "${w}". Trả lời Markdown:\n# ${w}\n## Phiên âm IPA\n## Loại từ\n## Nghĩa tiếng Việt\n## Ví dụ`;
    try {
      const raw = await askAI(p);
      setDictResult(raw);
      await saveToDb('dict', raw, { word: w }, mode);
      loadHistory();
    } catch (e) {
      setDictResult('Lỗi tra từ: ' + errorText(e));
    } finally {
      setDictLoading(false);
    }
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '20px', fontWeight: 900, marginBottom: '4px' }}>🇬🇧 Luyện Tiếng Anh</h1>
        </div>
        <div suppressHydrationWarning className="pill" style={{ borderColor: ttsOnline ? 'var(--green)' : 'var(--orange)', color: ttsOnline ? 'var(--green)' : 'var(--orange)', background: ttsOnline ? '#3fb95011' : '#d2992211' }}>
          {ttsOnline ? '☁️ AI Cloud' : '🔇 Browser TTS'}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            style={{
              padding: '8px 14px',
              borderRadius: 99,
              border: '1px solid',
              whiteSpace: 'nowrap',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
              borderColor: tab === t.id ? 'var(--accent)' : 'var(--border)',
              background: tab === t.id ? 'var(--accent)' : 'var(--surface2)',
              color: tab === t.id ? '#000' : 'var(--muted)',
              boxShadow: tab === t.id ? '0 4px 12px rgba(88,166,255,0.2)' : 'none'
            }}
          >
            {t.l}
          </button>
        ))}
      </div>


      {/* Mode selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Chế độ luyện tập:</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {MODES.map(m => {
            const mapType = tab === 'write' ? 'writing' : tab === 'read' ? 'reading' : tab;
            const count = m.id === 'all'
              ? history.filter(h => h.type === mapType).length
              : history.filter(h => {
                if (h.type !== mapType) return false;
                try {
                  const itemMode = JSON.parse(h.metadata || '{}').mode || 'coder';
                  return itemMode === m.id;
                } catch {
                  return false;
                }
              }).length;

            return (
              <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderColor: mode === m.id ? 'var(--green)' : 'var(--border)', background: mode === m.id ? 'var(--green)11' : 'var(--surface2)', color: mode === m.id ? 'var(--green)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}>
                {m.label}
                {count > 0 && <span style={{ fontSize: 10, background: mode === m.id ? 'var(--green)' : 'var(--surface2)', color: mode === m.id ? '#000' : 'var(--muted)', padding: '1px 5px', borderRadius: 99, fontWeight: 800 }}>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Global Level Selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Trình độ mục tiêu (Global Level):</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {READ_LEVELS.map(l => (
            <button 
              key={l.id} 
              onClick={() => changeGlobalLevel(l.id)} 
              style={{ 
                padding: '6px 16px', borderRadius: 8, border: '1px solid', 
                fontSize: 12, fontWeight: 800, cursor: 'pointer', 
                borderColor: level === l.id ? 'var(--accent)' : 'var(--border)', 
                background: level === l.id ? 'var(--accent)11' : 'var(--surface2)', 
                color: level === l.id ? 'var(--accent)' : 'var(--muted)',
                transition: 'all 0.15s'
              }}
            >
              {l.label}
            </button>
          ))}
          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', marginLeft: 6 }}>
            💡 Thay đổi sẽ áp dụng cho tất cả bài học mới tạo.
          </div>
        </div>
      </div>

      {/* Batch + Admin */}
      {['curriculum', 'listen', 'speak', 'write', 'read', 'vocab', 'grammar'].includes(tab) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            className={`btn ${batchRunning ? 'btn-danger-soft' : 'btn-premium'}`}
            style={{ flex: '1 1 0', minWidth: 140, minHeight: 48, fontSize: 14, lineHeight: 1.25, whiteSpace: 'normal', wordBreak: 'break-word' }}
            onClick={genNextUnit}
            title="Tạo Bài tiếp theo theo giáo trình CEFR — Nghe/Nói/Viết/Đọc + 10 từ vựng + Ngữ pháp"
          >
            {batchRunning ? `⏸ ${batchProgress || 'Dừng'}` : '📚 Tạo Bài tiếp theo'}
          </button>
          <button
            className={`btn ${batchRunning ? 'btn-danger-soft' : 'btn-secondary'}`}
            style={{ flex: '1 1 0', minWidth: 140, minHeight: 48, fontSize: 14, lineHeight: 1.25, whiteSpace: 'normal', wordBreak: 'break-word' }}
            onClick={gen10Units}
            title="Tạo 10 bài liên tiếp theo giáo trình, mỗi bài đủ 6 kỹ năng"
          >
            {batchRunning ? `⏸ Dừng ${batchProgress}` : '🚀 Tạo 10 bài'}
          </button>
          {/* <button
            className={`btn ${batchRunning ? 'btn-danger-soft' : 'btn-secondary'}`}
            style={{ flex: '1 1 180px', minWidth: 0, minHeight: 48, fontSize: 13, lineHeight: 1.25, whiteSpace: 'normal', wordBreak: 'break-word' }}
            onClick={genBatch}
            title="Tạo 10 bài cho tab hiện tại (không theo giáo trình)"
          >
            {batchRunning ? `⏸ Dừng ${batchProgress}` : `🚀 10 ${tab === 'listen' ? 'bài Nghe' : tab === 'speak' ? 'bài Nói' : tab === 'write' ? 'bài Viết' : tab === 'read' ? 'bài Đọc' : tab === 'vocab' ? 'bộ Từ vựng' : 'bài Ngữ pháp'}`}
          </button> */}
        </div>
      )}
      {batchMsg && (() => {
        const isSuccess = batchMsg.startsWith('✅');
        const isPaused = batchMsg.startsWith('⏸');
        const color = isSuccess ? '#3fb950' : isPaused ? '#d29922' : '#f85149';
        const bg = isSuccess ? '#0a1a0d' : isPaused ? '#1a1408' : '#1a0a0a';
        return <div style={{ background: bg, border: `1px solid ${color}`, borderRadius: 8, padding: 10, marginBottom: 16, color, fontSize: 13 }}>{batchMsg}</div>;
      })()}

      <div className="desktop-main-side">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, minWidth: 0 }}>
          {/* ── UNIT HEADER ── */}
          {selectedUnit && tab !== 'curriculum' && (
            <div className="card" style={{ padding: '16px 20px', background: 'var(--surface)', borderLeft: `4px solid ${LEVEL_COLORS[level] || 'var(--accent)'}`, marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: LEVEL_COLORS[level] || 'var(--accent)', fontWeight: 800, marginBottom: 2 }}>
                    TRÌNH ĐỘ {level} • BÀI {selectedUnit}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-main)' }}>
                    {selectedUnitTitle || (UNIT_CURRICULUM[level]?.[selectedUnit - 1]?.title) || 'Chủ đề bài học'}
                  </div>
                </div>
                <button 
                  onClick={() => { setSelectedUnit(null); setSelectedUnitTitle(''); setTab('curriculum'); }}
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', fontWeight: 700 }}
                >
                  Đổi bài học 🗺️
                </button>
              </div>
            </div>
          )}

          {/* ── CURRICULUM ── */}
          {tab === 'curriculum' && (
            <CurriculumTab
              history={history}
              loadLesson={loadLesson}
              deleteUnit={deleteUnit}
              startNewLesson={(level, unit, skill, title) => {
                setLevel(level);
                setSelectedUnit(unit);
                setSelectedUnitTitle(title);
                setTab(skill as any);
                // Pre-fill custom topics for generation
                if (skill === 'listen') setListenCustomTopic(`Bài ${unit}: ${title}`);
                else if (skill === 'speak') setSpkCustomTopic(`Bài ${unit}: ${title}`);
                else if (skill === 'write') setWriteCustomPrompt(`Bài ${unit}: ${title}`);
                else if (skill === 'read') setReadCustomTopic(`Bài ${unit}: ${title}`);
                else if (skill === 'grammar') setGrammarCustomTopic(`Bài ${unit}: ${title}`);
                else if (skill === 'vocab') setVocabTopic(`Bài ${unit}: ${title}`);
              }}
              historyLoading={historyLoading}
            />
          )}

          {/* ── LISTEN ── */}
          {tab === 'listen' && (
            <div className="desktop-2col">
              <div>
                <div className="card" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div className="section-title" style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>🎧 Bài Nghe</div>
                      {(() => {
                        const item = history.find(h => h.type === 'listen' && h.content === listenText);
                        if (item && (item.learnCount ?? 0) > 0) {
                          return (
                            <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 8, background: '#3fb95022', color: '#3fb950', fontSize: 10, fontWeight: 700, border: '1px solid #3fb95044' }}>
                              ✓ Đã học {item.learnCount} lần
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    {history.find(h => h.type === 'listen' && h.content === listenText) && (
                      <button
                        onClick={() => {
                          const item = history.find(h => h.type === 'listen' && h.content === listenText);
                          if (item) markLessonLearned(item.id);
                        }}
                        style={{ padding: '6px 12px', borderRadius: 8, background: '#3fb950', color: '#000', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(63,185,80,0.2)' }}
                      >
                        ✓ Đánh dấu đã học
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    {READ_LEVELS.map(l => (
                      <button key={l.id} onClick={() => setListenLevel(l.id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderColor: listenLevel === l.id ? 'var(--accent)' : 'var(--border)', background: listenLevel === l.id ? '#58a6ff22' : 'transparent', color: listenLevel === l.id ? 'var(--accent)' : 'var(--muted)' }}>{l.label}</button>
                    ))}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>✏️ Hoặc tự nhập chủ đề (tiếng Việt):</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="input"
                        value={listenCustomTopic}
                        onChange={e => setListenCustomTopic(e.target.value)}
                        placeholder="Ví dụ: Cuộc trò chuyện tại quán cà phê..."
                        style={{ flex: 1, fontSize: 16 }}
                      />
                      <button
                        onClick={genListenText}
                        disabled={!listenCustomTopic.trim() || listenLoading}
                        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: listenCustomTopic.trim() && !listenLoading ? 'var(--green)' : 'var(--surface2)', color: listenCustomTopic.trim() && !listenLoading ? '#000' : 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: listenCustomTopic.trim() && !listenLoading ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
                      >
                        {listenLoading ? '⏳...' : '🤖 Tạo'}
                      </button>
                    </div>
                  </div>
                  <textarea className="input" value={listenText} onChange={e => setListenText(e.target.value)} rows={6}
                    placeholder="Bấm 'AI tạo đoạn nghe' hoặc tự nhập tiếng Anh..." style={{ marginBottom: 12 }} />

                  {/* Voice selector (Back to Listen Tab) */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                    {[
                      { id: 'en-US-AvaNeural', l: '☁️ Nữ (Ava)', s: 'edge' },
                      { id: 'en-US-AndrewNeural', l: '☁️ Nam (Andrew)', s: 'edge' },
                      { id: 'en-US-BrianNeural', l: '☁️ Nam (Brian)', s: 'edge' },
                      ...(isAdmin ? [
                        { id: 'en_female', l: '💎 Nữ (Carissa)', s: 'luxtts' },
                        { id: 'en_male', l: '💎 Nam (Dave)', s: 'luxtts' },
                        { id: 'paul', l: '💎 Nam (Paul)', s: 'luxtts' }
                      ] : [])
                    ].map(v => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setGlobalVoice(v.id);
                          setGlobalTtsProvider(v.s as any);
                        }}
                        style={{ flex: '1 1 30%', padding: '7px', borderRadius: 8, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderColor: globalVoice === v.id ? 'var(--accent)' : 'var(--border)', background: globalVoice === v.id ? '#58a6ff22' : 'var(--surface2)', color: globalVoice === v.id ? 'var(--accent)' : 'var(--muted)', whiteSpace: 'nowrap' }}
                      >
                        {v.l}
                      </button>
                    ))}
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                      <span style={{ color: 'var(--muted)' }}>Tốc độ phát</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{globalSpeed}x</span>
                    </div>
                    <input type="range" min={0.5} max={1.5} step={0.05} value={globalSpeed}
                      onChange={e => setGlobalSpeed(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" style={{ flex: 1, height: 42 }} onClick={genListenText} disabled={listenLoading}>
                      {listenLoading ? '⏳ Tạo...' : '🤖 Tạo mới'}
                    </button>
                    <button onClick={() => { const next = !listenLooping; setListenLooping(next); listenLoopingRef.current = next; }} className="btn btn-secondary" style={{ flex: 1, height: 42, background: listenLooping ? 'var(--accent)22' : undefined, color: listenLooping ? 'var(--accent)' : undefined, borderColor: listenLooping ? 'var(--accent)' : undefined }} title="Lặp lại">
                      {listenLooping ? '🔂 Lặp' : '🔁 Lặp'}
                    </button>
                    {playing ? (
                      <button className="btn btn-danger-soft" style={{ flex: 1, height: 42 }} onClick={stopPlayText}>
                        ⏸ Dừng
                      </button>
                    ) : (
                      <button className="btn btn-premium" style={{ flex: 1, height: 42 }} onClick={() => playText()} disabled={!listenText}>
                        ▶ Phát
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                {listenText && (
                  <div className="card">
                    <div className="section-title">Phát từng câu</div>
                    {listenText.split(/(?<=[.!?])\s+/).filter(Boolean).map((s, i) => (
                      <button key={i} onClick={() => playText(s)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, cursor: 'pointer', marginBottom: 6, lineHeight: 1.5, transition: 'border-color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                        <span style={{ color: 'var(--muted)', marginRight: 8 }}>{i + 1}.</span>{s}
                      </button>
                    ))}

                    {listenVi && (
                      <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                        <button onClick={() => setShowListenVi(!showListenVi)} style={{ background: 'none', border: 'none', color: 'var(--orange)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          {showListenVi ? '🔽 Ẩn bản dịch' : '▶ Hiện bản dịch tiếng Việt'}
                        </button>
                        {showListenVi && (
                          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, padding: '8px 12px', background: 'rgba(210, 153, 34, 0.05)', borderRadius: 8, fontStyle: 'italic' }}>
                            {listenVi}
                          </div>
                        )}
                      </div>
                    )}

                    {listenVocab && listenVocab.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div className="section-title" style={{ fontSize: 12, color: 'var(--green)', marginBottom: 8 }}>📚 Từ vựng cần lưu ý</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {listenVocab.map((v, i) => (
                            <div key={i} style={{ padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{v.w}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{v.m}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SPEAK ── */}
          {tab === 'speak' && (
            <SpeakTab
              spkTopicLoading={spkTopicLoading} spkTopic={spkTopic} spkLoading={spkLoading} spkRecordId={spkRecordId}
              spkLevel={spkLevel} setSpkLevel={setSpkLevel}
              spkCustomTopic={spkCustomTopic} setSpkCustomTopic={setSpkCustomTopic}
              spkSampleDirection={spkSampleDirection} setSpkSampleDirection={setSpkSampleDirection}
              spkSample={spkSample} setSpkSample={setSpkSample} spkSampleLoading={spkSampleLoading}
              spkTopicError={spkTopicError} spkFeedback={spkFeedback}
              transcript={transcript} recognizing={recognizing} sttStatus={sttStatus}
              genSpkTopic={genSpkTopic} genSpkSample={genSpkSample} getFeedback={getFeedback}
              startRec={startRec} stopRec={stopRec}
              markLessonLearned={markLessonLearned} stopTask={stopTask}
              getGenMessage={getGenMessage} genElapsed={genElapsed}
              speak={speak} globalSpeed={globalSpeed} globalVoice={globalVoice} globalTtsProvider={globalTtsProvider}
              parseMarkdown={parseMarkdown} history={history}
            />
          )}
          {/* ── WRITE ── */}
          {tab === 'write' && (
            <WriteTab
              writeTopicLoading={writeTopicLoading} writePrompt={writePrompt} writeRecordId={writeRecordId}
              writeLoading={writeLoading} writeTopicError={writeTopicError}
              writeLevel={writeLevel} setWriteLevel={setWriteLevel}
              writeCustomPrompt={writeCustomPrompt} setWriteCustomPrompt={setWriteCustomPrompt}
              writeSampleDirection={writeSampleDirection} setWriteSampleDirection={setWriteSampleDirection}
              writeSample={writeSample} setWriteSample={setWriteSample} writeSampleLoading={writeSampleLoading}
              writeText={writeText} setWriteText={setWriteText} wordCount={wordCount}
              writeFeedback={writeFeedback} setWriteFeedback={setWriteFeedback}
              genWriteTopic={genWriteTopic} genWriteSample={genWriteSample} checkWriting={checkWriting}
              markLessonLearned={markLessonLearned} stopTask={stopTask}
              getGenMessage={getGenMessage} genElapsed={genElapsed}
              speak={speak} globalSpeed={globalSpeed} globalVoice={globalVoice} globalTtsProvider={globalTtsProvider}
              parseMarkdown={parseMarkdown} history={history}
            />
          )}
          {/* ── VOCAB ── */}
          {tab === 'vocab' && (
            <VocabTab
              cards={cards} setCards={setCards}
              cardIdx={cardIdx} setCardIdx={setCardIdx}
              flipped={flipped} setFlipped={setFlipped}
              known={known}
              vocabRecordId={vocabRecordId}
              vocabLoading={vocabLoading} loadVocab={loadVocab}
              history={history} mode={mode}
              speak={speak} globalSpeed={globalSpeed} globalVoice={globalVoice} globalTtsProvider={globalTtsProvider}
              markLessonLearned={markLessonLearned}
            />
          )}
          {/* ── READING ── */}
          {tab === 'read' && (
            <ReadTab
              readLevel={readLevel} setReadLevel={setReadLevel}
              readCustomTopic={readCustomTopic} setReadCustomTopic={setReadCustomTopic}
              readLoading={readLoading} readError={readError}
              readArticle={readArticle} readRecordId={readRecordId}
              readSelected={readSelected} setReadSelected={setReadSelected}
              readLookup={readLookup} readLookupLoading={readLookupLoading}
              readQuestions={readQuestions}
              readAnswers={readAnswers} setReadAnswers={setReadAnswers}
              readSubmitted={readSubmitted} setReadSubmitted={setReadSubmitted}
              readScore={readScore}
              readChat={readChat} readChatInput={readChatInput} setReadChatInput={setReadChatInput}
              readChatLoading={readChatLoading}
              readSpeaking={readSpeaking} setReadSpeaking={setReadSpeaking}
              generateReading={generateReading} readLookupFn={readLookupFn} sendReadChat={sendReadChat}
              markLessonLearned={markLessonLearned}
              speak={speak} globalSpeed={globalSpeed} globalVoice={globalVoice} globalTtsProvider={globalTtsProvider}
              parseMarkdown={parseMarkdown} history={history}
            />
          )}
          {tab === 'grammar' && (
            <GrammarTab
              grammarTopics={GRAMMAR_TOPICS}
              grammarTopic={grammarTopic} setGrammarTopic={setGrammarTopic}
              grammarCustomTopic={grammarCustomTopic} setGrammarCustomTopic={setGrammarCustomTopic}
              grammarLoading={grammarLoading}
              grammarLesson={grammarLesson}
              grammarRecordId={grammarRecordId}
              history={history}
              grammarQuizAnswers={grammarQuizAnswers}
              grammarUserAnswers={grammarUserAnswers} setGrammarUserAnswers={setGrammarUserAnswers}
              grammarSubmitted={grammarSubmitted} setGrammarSubmitted={setGrammarSubmitted}
              genGrammarLesson={genGrammarLesson}
              markLessonLearned={markLessonLearned}
              parseMarkdown={parseMarkdown}
            />
          )}
          {/* ── GUIDE ── */}
          {tab === 'guide' && <GuideTab />}

          {/* ── DICT ── */}
          {tab === 'dict' && (
            <DictTab
              dictInput={dictInput} setDictInput={setDictInput}
              dictResult={dictResult} setDictResult={setDictResult}
              dictLoading={dictLoading} lookupWord={lookupWord}
              history={history} mode={mode} loadHistory={loadHistory}
              speak={speak} globalSpeed={globalSpeed} globalVoice={globalVoice} globalTtsProvider={globalTtsProvider}
              parseMarkdown={parseMarkdown}
            />
          )}

        </div>

        {/* ── TAB-SPECIFIC HISTORY COLUMN ── */}
        <div style={{ display: tab === 'dict' ? 'none' : undefined }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="section-title" style={{ margin: 0 }}>📚 Lịch sử ({history.filter(h => h.type === (tab === 'write' ? 'writing' : tab === 'read' ? 'reading' : tab)).length})</div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={loadHistory}>↻ Tải lại</button>
            </div>
            {(() => {
              const mapType = tab === 'write' ? 'writing' : tab === 'read' ? 'reading' : tab;
              const now = Date.now();
              const due = history.filter(h => h.type === mapType && h.nextReviewAt && new Date(h.nextReviewAt).getTime() <= now);
              if (!due.length) return null;
              return (
                <div style={{ marginBottom: 12, padding: '6px 10px', background: '#d2992222', border: '1px solid #d29922', borderRadius: 8, fontSize: 12, color: '#d29922', fontWeight: 700 }}>
                  🔔 Cần ôn: {due.length} bài
                </div>
              );
            })()}
            {historyLoading && <div style={{ color: 'var(--muted)', padding: 20 }}>Đang tải dữ liệu...</div>}

            <div style={{ maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
              {(() => {
                const mapType = tab === 'write' ? 'writing' : tab === 'read' ? 'reading' : tab;
                const items = history.filter(h => {
                  if (h.type !== mapType) return false;
                  if (mode === 'all') return true;
                  const itemMode = (() => { try { return JSON.parse(h.metadata || '{}').mode || 'coder'; } catch { return 'coder'; } })();
                  return itemMode === mode;
                });
                if (!items.length && !historyLoading) return <div style={{ color: 'var(--muted)', fontSize: 13, padding: 10 }}>Chưa có bài lưu cho phần này.</div>;

                return items.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 8px', borderBottom: '1px solid var(--surface2)', cursor: 'pointer', borderRadius: 8, transition: 'background 0.15s' }}
                    onClick={() => loadLesson(item)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                        {mapType === 'vocab' ? item.content : (
                          (mapType === 'speak' || mapType === 'writing' || mapType === 'grammar') ? (() => { try { const m = JSON.parse(item.metadata || '{}'); return m.topic || m.prompt || item.content.slice(0, 50) || 'Bài học'; } catch { return item.content.slice(0, 50); } })()
                            : (mapType === 'reading') ? (() => { try { return JSON.parse(item.metadata || '{}').title; } catch { return item.content.slice(0, 50); } })()
                              : item.content.slice(0, 60))}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{new Date(item.createdAt).toLocaleString('vi')}</span>
                        {mapType === 'vocab' && (() => {
                          try {
                            const m = JSON.parse(item.metadata || '{}');
                            return (
                              <>
                                {m.ipa && <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'monospace' }}>/{m.ipa}/</span>}
                                {m.vi && <span style={{ fontSize: 10, color: 'var(--green)', fontStyle: 'italic' }}>• {m.vi}</span>}
                              </>
                            );
                          } catch { return null; }
                        })()}
                        <span style={{
                          padding: '1px 6px', borderRadius: 4,
                          background: item.learnCount > 0 ? '#3fb95022' : 'var(--surface2)',
                          color: item.learnCount > 0 ? '#3fb950' : 'var(--muted)',
                          fontWeight: 700, fontSize: 9
                        }}>
                          {item.learnCount > 0 ? `✓ Lần ${item.learnCount}` : '⏳ Chưa học'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {(mapType === 'speak' || mapType === 'writing' || mapType === 'reading' || mapType === 'grammar' || mapType === 'vocab') && (
                        <button onClick={(e) => { e.stopPropagation(); markLessonLearned(item.id); }} style={{ fontSize: 12, background: item.learnCount > 0 ? '#3fb95033' : 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, color: item.learnCount > 0 ? '#3fb950' : 'var(--muted)', fontWeight: 700 }}>
                          ✓
                        </button>
                      )}
                      {mapType === 'vocab' && (
                        <button onClick={(e) => { e.stopPropagation(); speak(item.content, globalSpeed, globalVoice, globalTtsProvider); }} style={{ fontSize: 14, background: 'var(--accent)15', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, color: 'var(--accent)' }}>
                          🔊
                        </button>
                      )}
                      
                      {deleteConfirmId === item.id ? (
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            await fetch('/api/english', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) });
                            setDeleteConfirmId(null);
                            loadHistory();
                          }} 
                          style={{ fontSize: 10, color: '#fff', background: '#f85149', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6, fontWeight: 900 }}
                        >
                          XÓA?
                        </button>
                      ) : (
                        <button onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(item.id);
                          setTimeout(() => setDeleteConfirmId(prev => prev === item.id ? null : prev), 3000);
                        }} style={{ fontSize: 12, color: '#f85149', background: '#f8514915', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f8514930' }} onMouseLeave={e => { e.currentTarget.style.background = '#f8514915' }}>
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
