'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

interface Lesson { id: number; track: string; topic: string; content: string; order: number; completed: boolean; learnCount: number; createdAt: string; nextReviewAt?: string | null; lastReviewedAt?: string | null; intervalDays?: number; easeFactor?: number; reviewCount?: number; }

const TRACKS = [
  { id: 'html-css', label: '🎨 HTML/CSS', color: '#f78166' },
  { id: 'javascript', label: '⚡ JavaScript', color: '#d29922' },
  { id: 'typescript', label: '🔷 TypeScript', color: '#3178c6' },
  { id: 'react', label: '⚛️ React', color: '#58a6ff' },
  { id: 'nextjs', label: '▲ Next.js', color: '#e6edf3' },
  { id: 'nodejs', label: '🟢 Node.js', color: '#3fb950' },
  { id: 'python', label: '🐍 Python', color: '#3572a5' },
  { id: 'fastapi', label: '⚡ FastAPI', color: '#05998b' },
  { id: 'java', label: '☕ Java', color: '#ed8b00' },
  { id: 'kotlin', label: '🟣 Kotlin', color: '#7f52ff' },
  { id: 'csharp', label: '🔵 C#/.NET', color: '#512bd4' },
  { id: 'cpp', label: '🔶 C++', color: '#00599c' },
  { id: 'go', label: '🐹 Go', color: '#00add8' },
  { id: 'rust', label: '🦀 Rust', color: '#ce422b' },
  { id: 'php', label: '🐘 PHP', color: '#777bb4' },
  { id: 'ruby', label: '💎 Ruby', color: '#cc342d' },
  { id: 'swift', label: '🍎 Swift', color: '#fa7343' },
  { id: 'dart', label: '🎯 Dart/Flutter', color: '#0175c2' },
  { id: 'postgresql', label: '🐘 PostgreSQL', color: '#336791' },
  { id: 'mssql', label: '🗄️ MS SQL Server', color: '#CC2927' },
  { id: 'git', label: '🔀 Git', color: '#f85149' },
  { id: 'api', label: '🔌 REST API', color: '#58a6ff' },
  { id: 'docker', label: '🐳 Docker', color: '#2496ed' },
  { id: 'linux', label: '🐧 Linux/Bash', color: '#ffcc00' },
  { id: 'excel-vba', label: '📊 Excel VBA', color: '#217346' },
  { id: 'powerbi', label: '📈 Power BI', color: '#F2CC0C' },
  {id: 'ai-ml', label: '🧠 AI/ML', color: '#7f52ff' },
  {id: 'langchain', label: '🦜 LangChain', color: '#00add8' },
  {id: 'fullstack', label: '🌐 Fullstack Web', color: '#22c55e' },
  {id: 'dsa', label: '🧩 Giải thuật & CTDL', color: '#facc15' },
  {id: 'system-design', label: '🏛️ System Design', color: '#a78bfa' },
  {id: 'oop', label: '🎯 OOP & SOLID', color: '#f472b6' },
  {id: 'design-patterns', label: '🧱 Design Patterns', color: '#60a5fa' },
  {id: 'sql-interview', label: '📝 SQL Phỏng vấn', color: '#34d399' },
  {id: 'leetcode', label: '💼 LeetCode Top', color: '#fb923c' },
  {id: 'behavioral', label: '🗣️ Phỏng vấn HR', color: '#94a3b8' },
];

const TRACK_INFO: Record<string, { desc: string, core: string, use: string }> = {
  'html-css': { desc: "Nền tảng của mọi website", core: "Tags, Selectors, Box Model, Flexbox/Grid", use: "Xây dựng cấu trúc và giao diện trang web" },
  'javascript': { desc: "Ngôn ngữ lập trình phổ biến nhất thế giới", core: "Event-driven, Async, DOM Manipulation", use: "Tạo tính tương tác cho web và làm Backend (Node.js)" },
  'typescript': { desc: "Phiên bản an toàn hơn của JavaScript", core: "Static Typing, Interfaces, Generics", use: "Dự án lớn, chuyên nghiệp, hạn chế lỗi runtime" },
  'react': { desc: "Thư viện UI mạnh mẽ từ Facebook", core: "Components, Hooks, State Management", use: "Xây dựng ứng dụng Web Single Page hiện đại" },
  'nextjs': { desc: "Framework React tốt nhất hiện nay", core: "SSR, SSG, Server Components, SEO optimization", use: "Website hiệu năng cao và chuẩn SEO" },
  'nodejs': { desc: "Chạy JavaScript trên máy tính/server", core: "V8 Engine, Non-blocking I/O, NPM ecosystem", use: "Xây dựng Server, API, công cụ dòng lệnh" },
  'python': { desc: "Ngôn ngữ đa năng, dễ học nhất", core: "Simple Syntax, Rich Libraries, Data structures", use: "AI, Data Science, Backend, Tự động hóa" },
  'fastapi': { desc: "Framework Python tạo API cực nhanh", core: "Pydantic, Async/Await, Auto Documentation", use: "Xây dựng API hiệu năng cao, hiện đại" },
  'java': { desc: "Ngôn ngữ doanh nghiệp ổn định", core: "OOP, Strong Typing, JVM, Multithreading", use: "Hệ thống ngân hàng, App Android, Backend lớn" },
  'kotlin': { desc: "Ngôn ngữ hiện đại cho Android", core: "Null Safety, Coroutines, Interoperable with Java", use: "Phát triển ứng dụng Android hiện đại" },
  'csharp': { desc: "Ngôn ngữ mạnh mẽ từ Microsoft", core: ".NET ecosystem, LINQ, Async/Await", use: "Game (Unity), App Windows, Web Backend" },
  'cpp': { desc: "Ngôn ngữ hiệu năng cực cao", core: "Memory Management, Pointers, Low-level access", use: "Game Engine, Hệ điều hành, Phần mềm nhúng" },
  'go': { desc: "Ngôn ngữ của hệ thống hiện đại", core: "Concurrency, Goroutines, Static Binary", use: "Hệ thống Cloud, Microservices (Docker, K8s)" },
  'rust': { desc: "Ngôn ngữ an toàn bộ nhớ nhất", core: "Ownership, Borrow Checker, Zero-cost abstractions", use: "Hệ thống cần hiệu năng cao và cực kỳ an toàn" },
  'php': { desc: "Ngôn ngữ truyền thống của Web", core: "Server-side scripting, WordPress, Composer", use: "Xây dựng Website nhanh, Thương mại điện tử" },
  'ruby': { desc: "Ngôn ngữ tập trung vào sự hạnh phúc của dev", core: "Elegant syntax, Rails framework, OOP", use: "Khởi nghiệp nhanh (Startup), Web Backend" },
  'swift': { desc: "Ngôn ngữ của hệ sinh thái Apple", core: "Safety, Speed, Modern Syntax, SwiftUI", use: "Phát triển App cho iPhone, iPad, Mac" },
  'dart': { desc: "Ngôn ngữ của Google cho đa nền tảng", core: "JIT/AOT compilation, Flutter framework", use: "Làm App Mobile (iOS/Android) từ một bộ code" },
  'postgresql': { desc: "CSDL quan hệ mã nguồn mở mạnh nhất", core: "SQL, ACID, Relational data, Extensions", use: "Lưu trữ dữ liệu lớn, an toàn, ổn định" },
  'mssql': { desc: "Hệ quản trị CSDL từ Microsoft", core: "T-SQL, Enterprise Security, Integration", use: "Hệ thống quản lý doanh nghiệp, SQL Server" },
  'git': { desc: "Công cụ quản lý phiên bản mã nguồn", core: "Commits, Branches, Merging, Rebase", use: "Làm việc nhóm, quản lý lịch sử code" },
  'api': { desc: "Giao thức kết nối các hệ thống", core: "REST, HTTP Methods, JSON, Authentication", use: "Kết nối Frontend với Backend, tích hợp dịch vụ" },
  'docker': { desc: "Công nghệ đóng gói ứng dụng", core: "Containers, Images, Dockerfile, Compose", use: "Triển khai ứng dụng nhất quán mọi nơi" },
  'linux': { desc: "Hệ điều hành của Server", core: "Terminal, Bash Scripting, Permissions", use: "Quản trị Server, DevOps, Lập trình hệ thống" },
  'excel-vba': { desc: "Tự động hóa trên Microsoft Excel", core: "Macros, Scripts, Office Automation", use: "Xử lý dữ liệu văn phòng, báo cáo tự động" },
  'powerbi': { desc: "Công cụ phân tích dữ liệu kinh doanh", core: "DAX, Data Modeling, Visualization", use: "Tạo báo cáo, Dashboard phân tích dữ liệu" },
  'ai-ml': { desc: "Trí tuệ nhân tạo và Máy học", core: "Models, Training, Neural Networks, Inference", use: "Nhận diện hình ảnh, chatbot, dự đoán dữ liệu" },
  'langchain': { desc: "Công cụ xây dựng ứng dụng với LLM", core: "Chains, Agents, Vector DBs, Prompt Engineering", use: "Xây dựng ứng dụng tích hợp AI chuyên sâu" },
  'fullstack': { desc: "Lộ trình xây ứng dụng web hoàn chỉnh", core: "HTML/CSS → JS/TS → React → Next.js → Node/API → PostgreSQL → Auth → Deploy", use: "Tự build app fullstack từ A-Z, đi xin việc Web Developer" },
  'dsa': { desc: "Giải thuật & Cấu trúc dữ liệu — bắt buộc khi phỏng vấn", core: "Array, String, HashMap, Stack/Queue, Tree, Graph, DP, Big-O", use: "Pass vòng coding interview ở mọi công ty" },
  'system-design': { desc: "Thiết kế hệ thống quy mô lớn", core: "Scalability, Load Balancer, Cache, DB sharding, Queue, CAP", use: "Phỏng vấn vị trí Mid/Senior, kiến trúc backend" },
  'oop': { desc: "Lập trình hướng đối tượng & nguyên lý SOLID", core: "Encapsulation, Inheritance, Polymorphism, Abstraction, SOLID", use: "Câu hỏi nền tảng phỏng vấn mọi vị trí dev" },
  'design-patterns': { desc: "Mẫu thiết kế kinh điển trong lập trình", core: "Singleton, Factory, Observer, Strategy, Decorator, MVC", use: "Viết code chuyên nghiệp, trả lời câu hỏi senior" },
  'sql-interview': { desc: "SQL chuyên sâu cho phỏng vấn", core: "JOIN, GROUP BY, Window Functions, Subquery, Index, N+1", use: "Phỏng vấn Backend, Data Engineer, Analyst" },
  'leetcode': { desc: "Bài tập LeetCode thường gặp", core: "Two Pointers, Sliding Window, BFS/DFS, Binary Search, DP", use: "Luyện coding interview FAANG/Big Tech" },
  'behavioral': { desc: "Câu hỏi hành vi & soft-skill khi phỏng vấn", core: "STAR method, Conflict, Teamwork, Leadership, Tell me about yourself", use: "Pass vòng HR / Manager, deal lương" }
};

export default function LearnMain() {
  const [me, setMe] = useState<{ id: number; name: string; role: string } | null>(null);
  const isAdmin = me?.role === 'admin';
  const [track, setTrack] = useState('javascript');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [current, setCurrent] = useState<Lesson|null>(null);
  const [loading, setLoading] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<string[]>([]);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [mode, setMode] = useState<'lesson'|'code'>('lesson');
  const [codeInput, setCodeInput] = useState('');
  const [codeExplanation, setCodeExplanation] = useState<string|null>(null);
  const [codeExample, setCodeExample] = useState<string|null>(null);
  const [codeLang, setCodeLang] = useState('javascript');
  const [activeCodeMode, setActiveCodeMode] = useState<'explain'|'generate'>('explain');
  const [codeSessions, setCodeSessions] = useState<any[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevTrackRef = useRef<string>('');
  const [aiModel, setAiModel] = useState('default');
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const batchStopRef = useRef(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [ttsProvider, setTtsProvider] = useState<'google' | 'edge' | 'piper' | 'luxtts' | 'browser'>('edge');
  const [edgeVoice, setEdgeVoice] = useState<string>('vi-VN-HoaiMyNeural');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopReadingRef = useRef(false);
  const isLoopingRef = useRef(false);
  const readingIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const savedModel = localStorage.getItem('eng_model');
    if (savedModel) setAiModel(savedModel);
    
    // Check auth
    fetch('/api/auth').then(r => r.json()).then(d => {
      if (d.user) setMe(d.user);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isMounted) localStorage.setItem('eng_model', aiModel);
  }, [aiModel, isMounted]);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/lessons');
      if (!res.ok) { setError('Lỗi tải bài học'); return; }
      const text = await res.text();
      if (!text) { setLessons([]); return; }
      setLessons(JSON.parse(text));
      setError(null);
    } catch (e) { setError('Lỗi: ' + String(e)); }
  }, []);

  async function loadCodeSessions() {
    try {
      const res = await fetch('/api/code');
      if (!res.ok) return;
      const data = await res.json();
      setCodeSessions(data);
    } catch (e) {
      console.error('Error loading code sessions:', e);
    }
  }

  async function deleteCodeSession(id: number) {
    await fetch('/api/code', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    await loadCodeSessions();
  }

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (mode === 'code') { loadCodeSessions(); } }, [mode]);

  // Tự động load bài CHƯA HỌC kế tiếp khi đổi track hoặc lần đầu load
  useEffect(() => {
    if (!lessons.length || mode !== 'lesson') return;
    const trackChanged = prevTrackRef.current !== track;
    prevTrackRef.current = track;
    // Chỉ auto-chọn khi: đổi track, hoặc chưa có bài nào đang mở
    if (!trackChanged && current !== null) return;

    const trackLs = lessons.filter(l => l.track === track);
    const lessonNum = (l: Lesson) => {
      const m = l.topic.match(/B[àa]i\s*(\d+)/i);
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    };
    const nextUnlearned = [...trackLs]
      .filter(l => !l.completed)
      .sort((a, b) => {
        const na = lessonNum(a), nb = lessonNum(b);
        if (na !== nb) return na - nb;
        return a.id - b.id;
      })[0];
    const target = nextUnlearned || [...trackLs].sort((a, b) => b.id - a.id)[0];

    if (target) {
      setCurrent(target);
      setQuizMode(false); setQuizSubmitted(false);
      const answers: string[] = [];
      const ms = target.content.matchAll(/ĐÁPÁN:([ABC])/g);
      for (const m of ms) answers.push(m[1]);
      setQuizAnswers(answers);
      setUserAnswers(answers.map(() => ''));
    } else {
      setCurrent(null);
    }
  }, [track, lessons, mode]);

  async function markComplete(lessonId: number) {
    const body: any = { id: lessonId, completed: true, incrementLearnCount: true };
    if (quizSubmitted && quizAnswers.length > 0) {
      body.quizScore = userAnswers.filter((a, i) => a === quizAnswers[i]).length;
      body.quizTotal = quizAnswers.length;
    }
    await fetch('/api/lessons', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const updatedLessons = await fetch('/api/lessons').then(res => res.json());
    setLessons(updatedLessons);

    const currentLesson = lessons.find(l => l.id === lessonId);
    if (currentLesson) {
      // Auto-sync roadmap
      try {
        const { syncRoadmap } = await import('@/lib/roadmap-sync');
        await syncRoadmap(currentLesson.track, currentLesson.topic);
      } catch {
        // Silent fail
      }

      const lessonNum = (l: any) => {
        const m = l.topic.match(/B[àa]i\s*(\d+)/i);
        return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
      };
      const next = updatedLessons
        .filter((l: any) => l.track === currentLesson.track && !l.completed && l.id !== lessonId)
        .sort((a: any, b: any) => {
          const na = lessonNum(a), nb = lessonNum(b);
          if (na !== nb) return na - nb;
          return a.id - b.id;
        })[0];

      const newCurrent = updatedLessons.find((l: any) => l.id === lessonId);

      // Nhật ký trang chủ
      if (newCurrent) {
        const today = new Date().toLocaleDateString('en-CA'); // yyyy-mm-dd
        fetch('/api/logs', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: today, addTopic: '💻 ' + newCurrent.topic })
        });
      }

      if (next) {
        // Tự chuyển sang bài kế tiếp
        setCurrent(next);
        setQuizMode(false); setQuizSubmitted(false); setUserAnswers([]);
        const answers: string[] = [];
        const ms = next.content.matchAll(/ĐÁPÁN:([ABC])/g);
        for (const m of ms) answers.push(m[1]);
        setQuizAnswers(answers);
        setUserAnswers(answers.map(() => ''));
      } else {
        setCurrent(newCurrent);
      }
    }
  }

  function buildLessonPrompt(targetTrack: string, curriculumStr: string) {
    return `Bạn là cô giáo Hoài My — giảng lập trình bằng giọng nhẹ nhàng, thủ thỉ. Ưu tiên NGẮN GỌN, DỄ HIỂU. Không lan man.
    Hãy tạo bài học về ${TRACKS.find(t=>t.id===targetTrack)?.label || targetTrack}.${curriculumStr}

    Quy tắc:
    - MỌI từ tiếng Anh (tên hàm, biến, thuật ngữ) PHẢI bọc backtick \`...\` để hệ thống đọc bằng giọng Anh. Ví dụ: \`match()\`, \`userName\`, \`Array\`.
    - KHÔNG viết phiên âm tiếng Việt cho từ Anh.
    - Khi gặp thuật ngữ mới, kèm 1 ví dụ đời thường ngắn trong ngoặc. Ví dụ: "\`array\` (giống dãy hộp xếp cạnh nhau)".
    - Câu ngắn, dễ hiểu, không sáo rỗng. Dùng "nhé", "mình cùng...", "bạn thấy không" vừa đủ, không lạm dụng.

    Format bài học (NGẮN, GỌN):

    # [Tên chủ đề]

    ## 🎯 Mục tiêu
    [1-2 câu nói bài này giúp gì.]

    ## 💡 Khái niệm cốt lõi
    [3-5 câu ngắn, giải thích thuật ngữ chính + 1 ví dụ đời thường.]

    ## 📖 Cách dùng
    [Dẫn dắt ngắn gọn. Nếu có nhiều bước thì mỗi bước là heading cấp 3:

    ### Bước 1: [tên bước]

    [1-2 câu.]

    ### Bước 2: [tên bước]

    [1-2 câu.]

    Không gộp nhiều bước vào 1 đoạn, không dùng **bold** thay heading.]

    ## 💻 Ví dụ code
    \`\`\`
    [Code NGẮN (5-10 dòng), rõ ràng, có comment tiếng Việt cuối dòng giải thích ngắn.]
    \`\`\`

    ## 🧠 Quiz (3 câu)
    QUAN TRỌNG: Mỗi câu PHẢI có đúng 3 lựa chọn A, B, C đầy đủ nội dung.
    1. [câu hỏi 1]?
    A) [đáp án A] B) [đáp án B] C) [đáp án C]
    ĐÁPÁN:B

    2. [câu hỏi 2]?
    A) [đáp án A] B) [đáp án B] C) [đáp án C]
    ĐÁPÁN:A

    3. [câu hỏi 3]?
    A) [đáp án A] B) [đáp án B] C) [đáp án C]
    ĐÁPÁN:C

    ## 🚀 Thực hành
    [1 bài tập nhỏ để người học tự tay gõ code và kiểm tra kiến thức]`;
  }

  // Lõi: tạo + lưu 1 bài cho track chỉ định. Trả về lesson đã lưu hoặc thông báo lỗi.
  async function buildAndSaveLesson(targetTrack: string, snapshot: Lesson[]): Promise<{ saved?: Lesson; error?: string; duplicate?: boolean }> {
    const existingTopics = snapshot
      .filter(l => l.track === targetTrack)
      .sort((a, b) => a.order - b.order || a.id - b.id)
      .map(l => l.topic);
    const ROADMAPS: Record<string, string> = {
      'fullstack': '1) HTML cơ bản → 2) CSS (Flexbox, Grid) → 3) JavaScript nền tảng (biến, hàm, DOM, event, async/await, fetch) → 4) TypeScript cơ bản → 5) React (components, props, state, hooks, useEffect) → 6) React nâng cao (context, custom hook, form) → 7) Next.js (App Router, layout, Server/Client Component) → 8) Next.js API routes, Server Actions → 9) Node.js (runtime, npm, module) → 10) REST API thiết kế → 11) PostgreSQL cơ bản → 12) Prisma ORM → 13) Auth (JWT, session) → 14) Deploy (Vercel, Docker) → 15) Best practice (env, error handling, testing)',
      'html-css': '1) Cấu trúc HTML, thẻ ngữ nghĩa → 2) Form, input, validate → 3) CSS selector, specificity → 4) Box model, position → 5) Flexbox → 6) Grid → 7) Responsive, media query → 8) Animation, transition → 9) Pseudo-class/element → 10) CSS variable, dark mode → 11) Accessibility (a11y) → 12) Tailwind/utility-first',
      'javascript': '1) Biến, kiểu dữ liệu → 2) Toán tử, điều kiện → 3) Vòng lặp → 4) Hàm, scope, closure → 5) Array & method (map/filter/reduce) → 6) Object, destructuring → 7) ES6 (let/const, arrow, spread) → 8) DOM, event → 9) Async/await, Promise → 10) Fetch API → 11) Module (import/export) → 12) Error handling → 13) Class & OOP → 14) Iterator/Generator',
      'typescript': '1) Type cơ bản → 2) Interface vs Type → 3) Union, Intersection → 4) Generic → 5) Utility Type (Partial, Pick, Omit) → 6) Type guard, narrowing → 7) Enum, Literal → 8) Module/namespace → 9) tsconfig → 10) Generic constraint → 11) Mapped/Conditional Type → 12) Decorator',
      'react': '1) JSX, component → 2) Props → 3) State (useState) → 4) Event → 5) List & key → 6) useEffect → 7) Form & controlled input → 8) Conditional render → 9) Lifting state → 10) Context API → 11) useReducer → 12) useMemo, useCallback → 13) Custom hook → 14) React Router → 15) Performance',
      'nextjs': '1) Cài đặt, App Router → 2) Page & layout → 3) Routing động → 4) Server vs Client Component → 5) Data fetching (fetch, cache) → 6) Server Action → 7) API route → 8) Middleware → 9) Image, Font optimization → 10) Metadata, SEO → 11) Auth (next-auth) → 12) Deploy Vercel',
      'nodejs': '1) Runtime, REPL, module → 2) NPM, package.json → 3) FS, path → 4) HTTP server → 5) Express setup → 6) Routing, middleware → 7) REST API → 8) Body parser, validation → 9) Database (Prisma/Sequelize) → 10) Auth (JWT) → 11) Error handling → 12) Test (Jest) → 13) Deploy',
      'python': '1) Biến, kiểu → 2) Điều kiện, vòng lặp → 3) Hàm, *args/**kwargs → 4) List, Tuple, Dict, Set → 5) String method → 6) File I/O → 7) Module, package → 8) Class, OOP → 9) Exception → 10) Decorator → 11) Generator, comprehension → 12) Async/await → 13) Type hint → 14) Virtualenv, pip',
      'fastapi': '1) Cài đặt, hello world → 2) Path & query param → 3) Pydantic model → 4) Request body → 5) Response model → 6) Dependency injection → 7) Auth (OAuth2, JWT) → 8) DB (SQLAlchemy) → 9) Async endpoint → 10) Background task → 11) Middleware, CORS → 12) Test → 13) Deploy',
      'java': '1) Biến, kiểu → 2) Điều kiện, vòng lặp → 3) Mảng → 4) Method → 5) Class, object → 6) Kế thừa, đa hình → 7) Interface, abstract → 8) Collection (List, Map, Set) → 9) Generic → 10) Exception → 11) File I/O → 12) Stream API → 13) Multithreading → 14) Maven/Gradle',
      'kotlin': '1) Biến (val/var) → 2) Null safety → 3) Hàm, lambda → 4) Class, data class → 5) Inheritance, sealed → 6) Collection → 7) Extension function → 8) Coroutines → 9) Flow → 10) Scope function → 11) DSL → 12) Android cơ bản',
      'csharp': '1) Biến, kiểu → 2) Điều kiện, vòng lặp → 3) Method → 4) Class, OOP → 5) Property, indexer → 6) Inheritance, interface → 7) Generic → 8) Collection (List, Dictionary) → 9) LINQ → 10) Async/await → 11) Exception → 12) File I/O → 13) Delegate, event → 14) .NET Core',
      'cpp': '1) Biến, kiểu, I/O → 2) Điều kiện, vòng lặp → 3) Hàm → 4) Mảng, string → 5) Pointer → 6) Reference → 7) Class, OOP → 8) Constructor, destructor → 9) Operator overload → 10) Template → 11) STL (vector, map, set) → 12) Smart pointer → 13) Memory → 14) Modern C++ (11/17/20)',
      'go': '1) Biến, kiểu → 2) Điều kiện, vòng lặp → 3) Function → 4) Struct, method → 5) Interface → 6) Slice, map → 7) Pointer → 8) Goroutine → 9) Channel → 10) Error handling → 11) Module → 12) HTTP server (net/http) → 13) Test → 14) Concurrency pattern',
      'rust': '1) Biến, kiểu → 2) Ownership → 3) Borrow, lifetime → 4) Struct, enum → 5) Pattern matching → 6) Trait → 7) Generic → 8) Collection (Vec, HashMap) → 9) Error (Result, Option) → 10) Iterator → 11) Module → 12) Cargo → 13) Async → 14) Concurrency (thread, channel)',
      'postgresql': '1) Cài đặt, psql → 2) CREATE TABLE, kiểu dữ liệu → 3) INSERT/UPDATE/DELETE → 4) SELECT, WHERE → 5) JOIN (INNER, LEFT, RIGHT) → 6) GROUP BY, HAVING → 7) Subquery → 8) Index → 9) Constraint, FK → 10) Transaction → 11) View, CTE → 12) Window function → 13) JSON, Array → 14) Performance',
      'mssql': '1) SSMS, T-SQL → 2) CREATE TABLE → 3) CRUD → 4) JOIN → 5) GROUP BY → 6) Subquery, CTE → 7) Stored procedure → 8) Function → 9) Trigger → 10) Index → 11) Transaction → 12) Window function → 13) Performance tuning',
      'git': '1) init, status → 2) add, commit → 3) log, diff → 4) branch, checkout → 5) merge → 6) rebase → 7) remote, push, pull → 8) clone, fork → 9) Conflict → 10) Stash → 11) Tag, release → 12) Reset, revert → 13) Cherry-pick → 14) Workflow (GitFlow, trunk)',
      'api': '1) HTTP cơ bản (method, status) → 2) REST nguyên tắc → 3) JSON → 4) URL design (resource) → 5) Query/path/body param → 6) Header, content-type → 7) Auth (Basic, Bearer, JWT) → 8) CORS → 9) Pagination, filter → 10) Versioning → 11) Error format → 12) OpenAPI/Swagger → 13) Rate limit → 14) Webhook',
      'docker': '1) Khái niệm container vs VM → 2) Image, layer → 3) docker run, ps → 4) Dockerfile → 5) Build & tag → 6) Volume → 7) Network → 8) docker-compose → 9) Multi-stage build → 10) Env, secret → 11) Registry → 12) Best practice (size, cache) → 13) Healthcheck → 14) Deploy',
      'linux': '1) Cấu trúc thư mục → 2) ls, cd, pwd → 3) cp, mv, rm → 4) chmod, chown → 5) cat, less, grep → 6) Pipe, redirect → 7) find, xargs → 8) Process (ps, kill) → 9) systemd → 10) SSH → 11) Bash variable, condition, loop → 12) Function, script → 13) cron → 14) Package manager (apt/yum)',
      'dsa': '1) Big-O, độ phức tạp → 2) Array → 3) String → 4) Hash Map/Set → 5) Two pointer → 6) Sliding window → 7) Stack → 8) Queue → 9) Linked list → 10) Recursion → 11) Binary search → 12) Sorting → 13) Tree, BST → 14) Heap → 15) Graph (BFS/DFS) → 16) Dijkstra → 17) Dynamic Programming → 18) Greedy → 19) Backtracking → 20) Trie',
      'system-design': '1) Client-Server, request flow → 2) Scalability (vertical/horizontal) → 3) Load Balancer → 4) Caching (Redis, CDN) → 5) Database (SQL vs NoSQL) → 6) Sharding, replication → 7) Message Queue (Kafka, RabbitMQ) → 8) CAP theorem → 9) Consistency model → 10) Microservice vs monolith → 11) API gateway → 12) Rate limit → 13) Search (Elasticsearch) → 14) Design URL shortener → 15) Design Twitter → 16) Design chat app → 17) Design YouTube → 18) Design Uber',
      'oop': '1) Class & object → 2) Encapsulation → 3) Constructor, this → 4) Inheritance → 5) Polymorphism (override, overload) → 6) Abstraction, abstract class → 7) Interface → 8) Composition vs inheritance → 9) SOLID — Single Responsibility → 10) SOLID — Open/Closed → 11) SOLID — Liskov → 12) SOLID — Interface Segregation → 13) SOLID — Dependency Inversion → 14) Coupling vs Cohesion',
      'design-patterns': '1) Singleton → 2) Factory → 3) Abstract Factory → 4) Builder → 5) Prototype → 6) Adapter → 7) Decorator → 8) Facade → 9) Proxy → 10) Composite → 11) Observer → 12) Strategy → 13) Command → 14) State → 15) Template Method → 16) Iterator → 17) Mediator → 18) MVC, MVVM',
      'sql-interview': '1) SELECT, WHERE, ORDER BY → 2) JOIN (INNER, LEFT, RIGHT, FULL) → 3) GROUP BY, HAVING → 4) Aggregate (COUNT, SUM, AVG) → 5) Subquery vs JOIN → 6) EXISTS vs IN → 7) UNION vs UNION ALL → 8) Window function (ROW_NUMBER, RANK, LAG) → 9) CTE, recursive CTE → 10) Index, EXPLAIN → 11) Transaction, ACID → 12) Isolation level → 13) N+1 problem → 14) Pivot, unpivot → 15) Tìm bản ghi thứ N',
      'leetcode': '1) Two Sum (HashMap) → 2) Valid Parentheses (Stack) → 3) Reverse Linked List → 4) Merge Two Sorted Lists → 5) Best Time to Buy Sell Stock → 6) Valid Anagram → 7) Binary Search → 8) Maximum Subarray (Kadane) → 9) Climbing Stairs (DP) → 10) Longest Substring Without Repeating (Sliding Window) → 11) 3Sum (Two Pointer) → 12) Container With Most Water → 13) Group Anagrams → 14) Tree DFS/BFS → 15) Number of Islands (Graph) → 16) Course Schedule (Topo sort) → 17) Coin Change (DP) → 18) Word Break → 19) Trie problems → 20) Backtracking (N-Queens, Permutation)',
      'behavioral': '1) Tell me about yourself → 2) STAR method (Situation, Task, Action, Result) → 3) Why this company? → 4) Strengths & weaknesses → 5) Conflict với đồng nghiệp → 6) Failure & lesson → 7) Tight deadline → 8) Disagree với sếp → 9) Lead a project → 10) Feedback (cho và nhận) → 11) Why leave current job? → 12) Salary negotiation → 13) Question to ask interviewer → 14) Long-term goal → 15) Khi không đồng ý technical decision',
    };
    const roadmap = ROADMAPS[targetTrack];
    const roadmapHint = roadmap
      ? `\n\nLỘ TRÌNH ${TRACKS.find(t=>t.id===targetTrack)?.label || targetTrack} (bám sát thứ tự này, mỗi bài tập trung 1 chủ đề nhỏ — đi đúng theo BẢN CHẤT vấn đề từ nền tảng → nâng cao):\n${roadmap}.\n\nNẾU là bài đầu: chọn bước 1. Các bài sau bám sát thứ tự trên, MỖI BÀI CHỈ MỘT CHỦ ĐỀ NHỎ. KHÔNG nhảy cóc.`
      : '';
    const curriculumStr = existingTopics.length > 0
      ? `\n\nNgười học đã học các bài sau theo thứ tự (từ cũ → mới nhất):\n${existingTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nHãy chọn CHỦ ĐỀ TIẾP THEO hợp lý theo lộ trình từ cơ bản → nâng cao, nối tiếp kiến thức từ các bài trên. Chủ đề mới phải:\n- Không trùng với bất kỳ bài nào ở trên.\n- Là bước kế tiếp tự nhiên về độ khó.\n- Nếu đã bao quát cơ bản, tiến sang trung cấp/nâng cao.${roadmapHint}`
      : `\n\nĐây là bài ĐẦU TIÊN của người học. Hãy bắt đầu từ khái niệm cốt lõi, nền tảng nhất của ${TRACKS.find(t=>t.id===targetTrack)?.label || targetTrack}.${roadmapHint}`;
    const prompt = buildLessonPrompt(targetTrack, curriculumStr);
    const res = await fetch('/api/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: aiModel, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return { error: 'AI không phản hồi' };
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { error: 'AI trả về rỗng' };
    const titleMatch = content.match(/^#\s+(.+)/m);
    const topic = titleMatch ? titleMatch[1].trim() : `${targetTrack} - ${new Date().toISOString().slice(0, 10)}`;
    const saveRes = await fetch('/api/lessons', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, content, track: targetTrack }),
    });
    if (!saveRes.ok) return { error: 'Lỗi lưu bài học' };
    const saved = await saveRes.json();
    if (!saved?.content) return { error: 'Lỗi lưu bài' };
    return { saved, duplicate: !!saved.duplicate };
  }

  async function genLesson() {
    setLoading(true); setCurrent(null); setQuizMode(false); setQuizAnswers([]); setUserAnswers([]); setQuizSubmitted(false);
    try {
      const r = await buildAndSaveLesson(track, lessons);
      if (r.error) { setError(r.error); setLoading(false); return; }
      if (r.saved) {
        if (r.duplicate) setError(`⚠️ AI tạo trùng bài "${r.saved.topic}" - thử lại để tạo bài mới khác`);
        else setError(null);
        setCurrent(r.saved);
        const answers: string[] = [];
        for (const m of r.saved.content.matchAll(/ĐÁPÁN:([ABC])/g)) answers.push(m[1]);
        setQuizAnswers(answers);
        setUserAnswers(answers.map(() => ''));
        await load();
      }
    } catch (e) {
      setError('Lỗi: ' + String(e));
    } finally {
      setLoading(false);
    }
  }

  async function genBatch() {
    if (batchRunning) { batchStopRef.current = true; return; }
    setBatchRunning(true);
    batchStopRef.current = false;
    setError(null);

    // Lấy snapshot mới nhất từ server để tránh stale state
    let snapshot: Lesson[] = await fetch('/api/lessons').then(r => r.ok ? r.json() : []).catch(() => []);
    const MAX = 10;
    let made = 0;
    const failures: string[] = [];

    const currentTrack = TRACKS.find(t => t.id === track) || TRACKS[0];
    let attempts = 0;
    const MAX_ATTEMPTS = MAX * 3;
    while (made < MAX && !batchStopRef.current && attempts < MAX_ATTEMPTS) {
      attempts++;
      setBatchProgress(`${made + 1}/${MAX} — ${currentTrack.label}`);
      try {
        const r = await buildAndSaveLesson(currentTrack.id, snapshot);
        if (r.saved && !r.duplicate) {
          snapshot = [...snapshot, r.saved];
          made++;
        } else if (r.duplicate) {
          failures.push(`lần ${attempts}: trùng`);
        } else if (r.error) {
          failures.push(`lần ${attempts}: ${r.error}`);
        }
      } catch (e) {
        failures.push(`lần ${attempts}: ${String(e)}`);
      }
    }

    await load();
    setBatchRunning(false);
    setBatchProgress('');
    if (batchStopRef.current) setError(`⏸ Đã dừng sau ${made} bài.`);
    else if (failures.length) setError(`✅ Tạo ${made} bài. ⚠️ Bỏ qua: ${failures.join('; ')}`);
    else setError(`✅ Đã tạo ${made} bài.`);
  }

  function submitQuiz() {
    setQuizSubmitted(true);
    setQuizMode(true);
  }

  async function explainCode() {
    if (!codeInput.trim()) { setError('Vui lòng nhập code'); return; }
    setLoading(true);
    setCodeExplanation(null);
    setActiveCodeMode('explain');
    const trackLabel = TRACKS.find(t => t.id === codeLang)?.label || codeLang;
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: aiModel, messages: [{ role: 'user', content: `Giải thích chi tiết code ${trackLabel} này (bằng tiếng Việt). Format:

## 📖 Giải thích
[Giải thích dễ hiểu từng dòng code, khái niệm chính]

## 💡 Khái niệm chính
[Liệt kê 3-5 khái niệm quan trọng]

## 💻 Ví dụ tương tự
[Code ví dụ tương tự nhưng đơn giản hơn, có comment]

## ⚠️ Lưu ý
[Những điểm cần chú ý, lỗi thường gặp]

Code cần giải thích:
\`\`\`
${codeInput}
\`\`\`` }] }),
      });
      if (!res.ok) { setError('AI không phản hồi'); setLoading(false); return; }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) { setError('AI trả về rỗng'); setLoading(false); return; }
      setCodeExplanation(content);
      setError(null);
      // Save to database
      await fetch('/api/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'explain', track: codeLang, input: codeInput, output: content }),
      });
      await loadCodeSessions();
    } catch (e) {
      setError('Lỗi: ' + String(e));
    }
    setLoading(false);
  }

  async function generateCode() {
    if (!codeInput.trim()) { setError('Vui lòng mô tả yêu cầu'); return; }
    setLoading(true);
    setCodeExample(null);
    setActiveCodeMode('generate');
    const trackLabel = TRACKS.find(t => t.id === codeLang)?.label || codeLang;
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: aiModel, messages: [{ role: 'user', content: `Viết code ${trackLabel} theo yêu cầu sau (bằng tiếng Việt). Format:

## 📝 Yêu cầu
[Tóm tắt yêu cầu]

## 💻 Code
\`\`\`
[Code hoàn chỉnh, có comment tiếng Việt]
\`\`\`

## 📖 Giải thích
[Giải thích code từng phần]

Yêu cầu:
${codeInput}` }] }),
      });
      if (!res.ok) { setError('AI không phản hồi'); setLoading(false); return; }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) { setError('AI trả về rỗng'); setLoading(false); return; }
      setCodeExample(content);
      setError(null);
      // Save to database
      await fetch('/api/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'generate', track: codeLang, input: codeInput, output: content }),
      });
      await loadCodeSessions();
    } catch (e) {
      setError('Lỗi: ' + String(e));
    }
    setLoading(false);
  }

  const readContent = async () => {
    if (!current) return;

    // Nếu đang đọc, dừng lại
    if (isReading) {
      stopReadingRef.current = true;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsReading(false);
      return;
    }

    setIsReading(true);
    stopReadingRef.current = false;
    const sessionId = ++readingIdRef.current;

    // 1. Chuẩn bị text — tách code block riêng để đọc từng dòng bằng giọng Anh
    type TTSChunk = { text: string; lang: 'vi' | 'en' };
    const contentWithoutQuiz = current.content.replace(/## 🧠 Quiz[\s\S]*/, '');
    const stripEmoji = (s: string) => s.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');
    const cleanVi = (t: string) => stripEmoji(t)
      .replace(/#{1,6}\s/g, ' . ')
      .replace(/[*_\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const ensureEnd = (t: string) => /[.!?,:;]$/.test(t) ? t : t + '.';
    const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;
    // Wordlist từ Việt không dấu phổ biến — gặp token nào trong đây thì TUYỆT ĐỐI không đọc bằng giọng Anh
    const VI_BARE_WORDS = new Set([
      // Đại từ, danh xưng
      'toi','tao','tau','minh','ban','cau','em','anh','chi','ong','ba','co','chu','cau','cha','me','con','no','ho','chung','nguoi','ai','nao','dau',
      // Liên từ, giới từ, trạng từ
      'la','va','thi','hay','hoac','nhung','ma','roi','con','cua','cho','den','di','ve','o','tai','tren','duoi','trong','ngoai','cung','voi','qua','sang','sau','truoc','giua','gan','xa','nhu','neu','khi','luc','hom','hien','nay','do','kia','ay','vay','sao','the','chi','luon','van','da','dang','se','vua','moi','chua','khong','chang','chi','cung','them','nua','rat','hoi','lam','qua','het','ca','moi','tat','mot','nhieu','it','vai',
      // Động từ
      'co','duoc','bi','phai','can','muon','nen','hay','lam','noi','doc','viet','nghe','nhin','xem','hoc','choi','an','uong','di','den','ve','ra','vao','len','xuong','nhau','gap','tim','thay','biet','hieu','nho','quen','yeu','thich','ghet','so','cuoi','khoc','song','chet','ngu','thuc','dung','ngoi','nam','chay','nhay','mua',
      // Số đếm
      'mot','hai','ba','bon','nam','sau','bay','tam','chin','muoi','tram','ngan','nghin','trieu','ty','von',
      // Tính từ thường
      'tot','xau','dep','hay','de','kho','nhanh','cham','lon','nho','cao','thap','rong','hep','dai','ngan','day','mong','nang','nhe','xanh','do','vang','trang','den','hong','tim','nau','xam','sach','ban','moi','cu','gia','tre','giau','ngheo','vui','buon','gian','hien','du','hien','nhieu','it',
      // Thời gian
      'gio','phut','giay','tuan','thang','nam','ngay','dem','sang','trua','chieu','toi','hom','nay','mai','kia','qua','xua','sau','truoc',
      // Danh từ phổ biến
      'nha','cua','xe','cay','hoa','la','nuoc','com','ban','ghe','sach','but','may','tay','chan','mat','tai','mui','mieng','rang','luoi','dau','co','tim','phoi','bung','da','long','toc','mat','troi','trang','sao','mua','nang','gio','bao','song','nui','bien','song','ho','suoi','duong','pho','xom','lang','xa','huyen','tinh','nuoc','que','viet','nam',
      // Món ăn / vật phẩm VN
      'banh','pho','bun','mien','chao','xoi','com','canh','tra','ca','phe','sua','duong','muoi','tieu','ot','toi','hanh','rau','thit','ga','heo','bo','tom','cua','ca','trung',
      // Liên từ/giới thiệu lesson
      'vi','du','nghia','cach','cach','khac','tuy','nhien','tuc','la','noi','chung','tom','lai','ket','luan','mat','khac','dieu','kien','tren','duoi','giua','dau','cuoi','phan','chuong','muc','bai',
    ]);
    // Whitelist thuật ngữ lập trình phổ biến (chữ thường, tránh nhầm với từ Việt)
    const EN_WHITELIST = new Set([
      'docker','container','image','volume','bridge','host','network','port','compose','dockerfile',
      'kubernetes','pod','node','cluster','deployment','service','ingress','namespace',
      'javascript','typescript','python','java','react','nextjs','nodejs','express','vue','angular',
      'function','method','variable','class','object','array','string','boolean','promise','callback',
      'async','await','import','export','const','let','default','return','null','undefined','true','false',
      'component','state','props','hook','effect','context','reducer','store','router','route',
      'api','url','uri','http','https','json','xml','html','css','sql','ssh','tcp','udp','dns','cdn','cli','sdk',
      'database','table','schema','model','migration','query','select','insert','update','delete',
      'server','client','backend','frontend','middleware','request','response','header','cookie','session','token',
      'git','github','gitlab','commit','push','pull','branch','merge','rebase','clone','fork',
      'terminal','shell','bash','zsh','linux','ubuntu','debian','macos','windows',
      'null','true','false','pattern','regex','string','number','integer','float','double',
      'build','deploy','test','debug','log','trace','error','warning','info',
    ]);
    const looksEnglish = (w: string): boolean => {
      if (!w || VI_DIACRITIC.test(w)) return false;
      if (w.length < 2) return false;
      const lower = w.toLowerCase();
      // Từ Việt không dấu → không phải tiếng Anh
      if (VI_BARE_WORDS.has(lower)) return false;
      // Dấu hiệu rõ ràng là token kỹ thuật
      if (/[()._\-]/.test(w)) return true;           // match(), my-network, user_name, v1.0
      if (/\d/.test(w)) return true;                  // v2, utf8
      if (/[a-z][A-Z]/.test(w)) return true;          // camelCase
      if (/^[A-Z]{2,}$/.test(w)) return true;         // API, URL, SQL, HTTP
      if (EN_WHITELIST.has(lower)) return true;
      return false;
    };
    // Tự động bọc các từ tiếng Anh (ngoài backtick). Nếu token nằm cạnh ký tự có dấu tiếng Việt
    // (tức là regex đang cắt ngang một từ Việt) thì TUYỆT ĐỐI không wrap.
    const autoWrapEn = (seg: string) =>
      seg.replace(/[A-Za-z][A-Za-z0-9_]*(?:\([^)]*\))?(?:[.\-][A-Za-z0-9_]+)*/g,
        (m, offset: number, src: string) => {
          const before = src.charAt(offset - 1);
          const after = src.charAt(offset + m.length);
          if (before && VI_DIACRITIC.test(before)) return m;
          if (after && VI_DIACRITIC.test(after)) return m;
          // 'đ/Đ' không thuộc [A-Za-z] nên không lọt vào match — không cần check thêm.
          return looksEnglish(m) ? '`' + m + '`' : m;
        });
    const pushViProse = (raw: string) => {
      // Giữ nguyên backtick có sẵn; auto-wrap phần còn lại
      const preTokens = raw.split(/(`[^`\n]+`)/g);
      const merged = preTokens.map(s => s.startsWith('`') && s.endsWith('`') ? s : autoWrapEn(s)).join('');
      // Tách inline code `...` → chunk en, phần còn lại → chunk vi
      const tokens = merged.split(/(`[^`\n]+`)/g);
      let viBuf = '';
      const flushVi = () => {
        const cleaned = cleanVi(viBuf);
        viBuf = '';
        if (!cleaned) return;
        const sentences = cleaned.split(/(?<=[.!?])\s+/);
        let buf = '';
        for (const s of sentences) {
          if (!s.trim()) continue;
          if (buf.length + s.length > 1500 && buf) { rawChunks.push({ lang: 'vi', text: ensureEnd(buf.trim()) }); buf = s; }
          else { buf += (buf ? ' ' : '') + s; }
        }
        if (buf.trim()) rawChunks.push({ lang: 'vi', text: ensureEnd(buf.trim()) });
      };
      for (const tok of tokens) {
        if (!tok) continue;
        if (tok.startsWith('`') && tok.endsWith('`')) {
          flushVi();
          const en = tok.slice(1, -1).trim();
          if (en) rawChunks.push({ lang: 'en', text: en });
        } else {
          viBuf += tok;
        }
      }
      flushVi();
    };

    const rawChunks: TTSChunk[] = [];
    const parts = contentWithoutQuiz.split(/(```[\w]*\n?[\s\S]*?```)/gm);
    for (const part of parts) {
      if (!part || !part.trim()) continue;
      const codeMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
      if (codeMatch) {
        const lines = codeMatch[2].split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
        if (!lines.length) continue;
        rawChunks.push({ lang: 'vi', text: 'Mình cùng xem đoạn code nhé.' });
        lines.forEach((line) => {
          const comments: string[] = [];
          // Gỡ lần lượt các loại comment, thu thập nội dung Việt
          let codePart = line;
          codePart = codePart.replace(/<!--([\s\S]*?)-->/g, (_, c) => { comments.push(c); return ''; }); // HTML
          codePart = codePart.replace(/\/\*([\s\S]*?)\*\//g, (_, c) => { comments.push(c); return ''; }); // /* */
          const lineCmt = codePart.match(/^([\s\S]*?)(?:\/\/|#)\s*(.+)$/);
          if (lineCmt) { comments.push(lineCmt[2]); codePart = lineCmt[1]; }
          codePart = codePart.trim();
          // Nếu phần còn lại vẫn dính dấu tiếng Việt → coi là văn Việt (không phát bằng giọng Anh)
          if (codePart) {
            if (VI_DIACRITIC.test(codePart)) {
              const cleaned = cleanVi(codePart);
              if (cleaned) rawChunks.push({ lang: 'vi', text: ensureEnd(cleaned) });
            } else {
              rawChunks.push({ lang: 'en', text: codePart });
            }
          }
          for (const c of comments) {
            const clean = stripEmoji(c).trim().replace(/[.!?,;]+$/, '');
            if (clean) rawChunks.push({ lang: 'vi', text: ensureEnd(clean) });
          }
        });
      } else {
        pushViProse(part);
      }
    }

    const chunks = rawChunks;
    if (!chunks.length) { setIsReading(false); return; }

    // 3. Hàm fetch audio với cơ chế thử lại mạnh mẽ (Retry 5 lần)
    const fetchAudio = async (chunk: TTSChunk, retries = 5): Promise<string | null> => {
      const viVoice = (ttsProvider === 'edge' || ttsProvider === 'luxtts') ? edgeVoice : 'default';
      const voice = chunk.lang === 'en'
        ? (ttsProvider === 'edge' ? 'en-US-AvaNeural' : 'default')
        : viVoice;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const controller = new AbortController();
          abortControllerRef.current = controller;
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: chunk.text,
              speed: 1.0,
              voice,
              lang: chunk.lang,
              server: ttsProvider === 'edge' ? 'edge' : ttsProvider === 'piper' ? 'piper' : undefined
            }),
            signal: controller.signal
          });
          
          if (res.ok) {
            const blob = await res.blob();
            return URL.createObjectURL(blob);
          }
          
          console.warn(`[TTS] Lỗi ${res.status}, thử lại lần ${attempt + 1}/${retries}...`);
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); // Chờ lâu hơn sau mỗi lần thử
        } catch (e) {
          console.error(`[TTS] Request failed: ${String(e)}`);
          if (attempt === retries) return null;
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      return null;
    };

    // 4. Playback loop — prefetch nhiều chunk song song để giảm độ trễ giữa VI/EN
    const CONCURRENCY = 6;
    const urls: (Promise<string | null> | null)[] = new Array(chunks.length).fill(null);
    let cursor = 0;
    let inflight = 0;
    const firePrefetch = () => {
      while (inflight < CONCURRENCY && cursor < chunks.length) {
        const idx = cursor++;
        inflight++;
        urls[idx] = fetchAudio(chunks[idx]).finally(() => {
          inflight--;
          if (!stopReadingRef.current && sessionId === readingIdRef.current) firePrefetch();
        });
      }
    };

    do {
      cursor = 0;
      for (let k = 0; k < urls.length; k++) urls[k] = null;
      firePrefetch();

      for (let i = 0; i < chunks.length; i++) {
        if (stopReadingRef.current || sessionId !== readingIdRef.current) break;

        console.log(`[TTS] Đang đọc đoạn ${i + 1}/${chunks.length}`);
        const url = await urls[i];

        if (!url) {
          console.warn(`[TTS] Bỏ qua đoạn ${i + 1} (không tải được).`);
          continue;
        }

        if (stopReadingRef.current || sessionId !== readingIdRef.current) {
          URL.revokeObjectURL(url);
          break;
        }

        await new Promise<void>((resolve) => {
          const audio = new Audio();
          audio.preload = 'auto';
          audio.src = url;
          audioRef.current = audio;
          const done = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onended = done;
          audio.onerror = () => { console.error("Audio playback error"); done(); };
          const startPlay = () => { audio.play().catch((e) => { console.error("Play failed", e); done(); }); };
          if (audio.readyState >= 3) startPlay();
          else audio.oncanplay = startPlay;
        });
      }
      // Delay nhỏ trước khi lặp lại bài mới
      if (isLoopingRef.current && !stopReadingRef.current && sessionId === readingIdRef.current) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } while (isLoopingRef.current && !stopReadingRef.current && sessionId === readingIdRef.current);

    if (sessionId === readingIdRef.current) setIsReading(false);
  }

  const score = quizSubmitted ? userAnswers.filter((a, i) => a === quizAnswers[i]).length : 0;

  // Escape HTML entities (dùng cho code blocks)
  function escapeHtml(s: string) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Render markdown content - xử lý code blocks trước để tránh parse HTML bên trong
  function renderContent(text: string, baseId: string = 'code') {
    // Bỏ H1 đầu (tránh trùng với title card)
    text = text.replace(/^#\s+.+\n+/, '');
    // Fix bài cũ: "**Bước N: ...**" (bold inline) → "### Bước N: ..." (heading riêng)
    text = text.replace(/\*\*(Bước\s*\d+[^*\n]*)\*\*/g, '\n\n### $1\n\n');
    // Tách code blocks ra, escape HTML bên trong, rồi ghép lại
    let blockCount = 0;
    const parts = text.split(/(```[\w]*\n?[\s\S]*?```)/gm);
    const processed = parts.map(part => {
      if (part.startsWith('```')) {
        const code = part.replace(/^```[\w]*\n?/, '').replace(/```$/, '');
        const escapedCode = escapeHtml(code);
        const codeId = `${baseId}-${blockCount++}`;
        return `<div style="position:relative;margin:10px 0">
          <pre id="${codeId}" style="background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:14px;overflow-x:auto;font-size:12.5px;line-height:1.7;color:#e6edf3;font-family:'SF Mono',Monaco,monospace;white-space:pre;text-align:left">${escapedCode}</pre>
          <button onclick="navigator.clipboard.writeText(document.getElementById('${codeId}').innerText);this.innerText='✓ Đã copy';setTimeout(()=>this.innerText='📋 Copy',2000)" style="position:absolute;top:8px;right:8px;padding:6px 12px;border-radius:4px;border:1px solid #30363d;background:#1c2230;color:#58a6ff;font-size:12px;cursor:pointer;font-weight:600">📋 Copy</button>
        </div>`;
      }
      // Xử lý inline: escape HTML trong `code` trước, dùng placeholder để khỏi bị re-parse
      const inlineCodes: string[] = [];
      let body = part.replace(/`([^`]+)`/g, (_, c) => {
        inlineCodes.push(escapeHtml(c));
        return `\x00${inlineCodes.length - 1}\x00`;
      });

      // Process tables: markdown table format | col1 | col2 |
      body = body.replace(/(\|.+\|\n\|[\s\-:|]+\|\n(?:\|.+\|\n)*)/gm, (match) => {
        const lines = match.trim().split('\n').filter(l => l.trim());
        if (lines.length < 2) return match;
        const headerLine = lines[0].split('|').map(c => c.trim()).filter(Boolean);
        const rows = lines.slice(2).map(line => line.split('|').map(c => c.trim()).filter(Boolean));
        let html = '<table style="border-collapse:collapse;width:100%;margin:12px 0;border:1px solid var(--border);border-radius:8px;overflow:hidden">';
        html += '<thead><tr style="background:var(--surface2);border-bottom:1px solid var(--border)">';
        headerLine.forEach(h => html += `<th style="padding:10px 12px;text-align:left;font-weight:700;color:var(--accent);border-right:1px solid var(--border)">${escapeHtml(h)}</th>`);
        html += '</tr></thead><tbody>';
        rows.forEach((row, i) => {
          html += `<tr style="${i%2===0?'background:transparent':'background:var(--surface2)'};border-bottom:1px solid var(--border)">`;
          row.forEach(cell => html += `<td style="padding:10px 12px;border-right:1px solid var(--border);color:var(--text)">${escapeHtml(cell)}</td>`);
          html += '</tr>';
        });
        html += '</tbody></table>';
        return html;
      });

      body = body
        .replace(/^## (.+)$/gm, '<h3 style="color:#d29922;font-size:17px;font-weight:700;margin:18px 0 8px;text-transform:uppercase;letter-spacing:0.5px">$1</h3>')
        .replace(/^### (.+)$/gm, '<h4 style="color:#e6edf3;font-size:15px;font-weight:600;margin:12px 0 6px">$1</h4>')
        .replace(/^#### (.+)$/gm, '<h5 style="color:#e6edf3;font-size:14px;font-weight:600;margin:10px 0 4px">$1</h5>')
        .replace(/^##### (.+)$/gm, '<h6 style="color:#e6edf3;font-size:12px;font-weight:600;margin:8px 0 2px">$1</h6>')
        .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e6edf3">$1</strong>')
        .replace(/^> (.*$)/gm, '<blockquote style="border-left:3px solid var(--muted);padding-left:12px;margin:10px 0;font-style:italic;color:var(--muted)">$1</blockquote>')
        .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--surface);margin:16px 0" />')
        .replace(/ĐÁPÁN:[ABC]/g, '');
      // Gộp thành paragraphs: tách bằng dòng trắng, mỗi đoạn là <p>
      const blocks = body.split(/\n{2,}/).map(block => {
        block = block.trim();
        if (!block) return '';
        // Nếu đã là block element thì giữ nguyên
        if (/^<[a-z]/i.test(block)) return block;
        // Đoạn văn bản: gộp single \n thành khoảng trắng
        const inline = block.replace(/\n/g, ' ');
        return `<p style="margin:0 0 10px;line-height:1.7;color:var(--text);font-size:17px">${inline}</p>`;
      }).join('');
      // Trả lại inline code
      return blocks.replace(/\x00(\d+)\x00/g, (_, i) =>
        `<code style="background:#1c2230;padding:2px 6px;border-radius:4px;font-size:14px;color:#d2a8ff;font-family:monospace">${inlineCodes[+i]}</code>`
      );
    });
    return processed.join('');
  }

  const trackObj = TRACKS.find(t => t.id === track);
  const trackLessons = lessons.filter(l => l.track === track);
  const now = Date.now();
  const isDue = (l: Lesson) => l.nextReviewAt ? new Date(l.nextReviewAt).getTime() <= now : false;
  const dueLessons = lessons.filter(isDue);
  const dueInTrack = trackLessons.filter(isDue);

  function loadLesson(l: Lesson) {
    setCurrent(l);
    setQuizMode(false); setQuizSubmitted(false); setUserAnswers([]);
    const answers: string[] = [];
    const ms = l.content.matchAll(/ĐÁPÁN:([ABC])/g);
    for (const m of ms) answers.push(m[1]);
    setQuizAnswers(answers);
    setUserAnswers(answers.map(() => ''));
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function startReview() {
    const pool = dueInTrack.length > 0 ? dueInTrack : dueLessons;
    if (!pool.length) return;
    const oldest = [...pool].sort((a, b) => new Date(a.nextReviewAt!).getTime() - new Date(b.nextReviewAt!).getTime())[0];
    if (oldest.track !== track) setTrack(oldest.track);
    loadLesson(oldest);
  }

  return (
    <div className="fade-in">
      {error && (() => {
        const isSuccess = error.startsWith('✅');
        const isPaused = error.startsWith('⏸');
        const color = isSuccess ? '#3fb950' : isPaused ? '#d29922' : '#f85149';
        const bg = isSuccess ? '#0a1a0d' : isPaused ? '#1a1408' : '#1a0a0a';
        const prefix = isSuccess || isPaused ? '' : '⚠️ ';
        return (
          <div style={{ background:bg, border:`1px solid ${color}`, borderRadius:8, padding:12, marginBottom:16, color, fontSize:13 }}>
            {prefix}{error}
          </div>
        );
      })()}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h1 className="page-title" style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>🧑‍💻 Bài Học Lập Trình AI</h1>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setMode('lesson')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${mode==='lesson'?'var(--accent)':'var(--border)'}`, background: mode==='lesson'?'var(--accent)22':'transparent', color: mode==='lesson'?'var(--accent)':'var(--muted)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }} className="mode-btn" title="Bài học">📖<span className="mode-text"> Bài học</span></button>
            <button onClick={() => setMode('code')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${mode==='code'?'var(--accent)':'var(--border)'}`, background: mode==='code'?'var(--accent)22':'transparent', color: mode==='code'?'var(--accent)':'var(--muted)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }} className="mode-btn" title="Hỏi code">💬<span className="mode-text"> Hỏi code</span></button>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{mode==='lesson'?`AI tạo bài mới, không lặp lại — ${lessons.length} bài đã học`:'Paste code và hỏi AI giải thích'}</div>
        {mode === 'lesson' && dueLessons.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#d2992222', border: '1px solid #d29922', borderRadius: 8 }}>
            <span style={{ fontSize: 13, color: '#d29922', fontWeight: 700 }}>🔔 Cần ôn: {dueLessons.length}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>• {dueInTrack.length} trong track này</span>
            <button onClick={startReview} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid #d29922', background: '#d29922', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Ôn ngay
            </button>
          </div>
        )}
      </div>

      {mode === 'lesson' && (
        <>
        {/* Track selector - Horizontal Scroll on Mobile */}
        <div style={{ 
          display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 
        }} className="no-scrollbar">
          {TRACKS.map(t => (
            <div key={t.id} className="track-wrapper">
              <button onClick={() => setTrack(t.id)} style={{
                padding: '7px 10px', borderRadius: 10, border: '1px solid',
                borderColor: track === t.id ? t.color : 'var(--border)',
                background: track === t.id ? t.color + '22' : 'var(--surface)',
                color: track === t.id ? t.color : 'var(--muted)',
                fontSize: 13, cursor: 'pointer', fontWeight: track === t.id ? 700 : 400,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                touchAction: 'manipulation'
              }}>{t.label}</button>
              
              <div className="track-tooltip" style={{ borderColor: t.color }}>
                <span className="tooltip-title" style={{ color: t.color }}>{t.label}</span>
                <span className="tooltip-desc">{TRACK_INFO[t.id]?.desc || 'Đang cập nhật...'}</span>
                <span className="tooltip-item"><strong>Cốt lõi:</strong> {TRACK_INFO[t.id]?.core || '...'}</span>
                <span className="tooltip-item"><strong>Dùng cho:</strong> {TRACK_INFO[t.id]?.use || '...'}</span>
              </div>
            </div>
          ))}
        </div>

        {trackLessons.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            ✅ Đã học {trackLessons.length} bài {trackObj?.label}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button className="btn btn-premium" style={{ flex: 1, minWidth: 0, minHeight: 56, padding: '8px 12px', fontSize: 15, lineHeight: 1.25, whiteSpace: 'normal', wordBreak: 'break-word' }} onClick={genLesson} disabled={loading || batchRunning}>
            {loading ? '⏳ AI đang soạn bài...' : `🤖 Tạo bài ${trackObj?.label} mới`}
          </button>
          <button
            className={`btn ${batchRunning ? 'btn-danger-soft' : 'btn-secondary'}`}
            style={{ flex: 1, minWidth: 0, minHeight: 56, padding: '8px 12px', fontSize: 14, lineHeight: 1.25, whiteSpace: 'normal', wordBreak: 'break-word' }}
            onClick={genBatch}
            disabled={loading && !batchRunning}
            title="Tạo liên tục 10 bài cho phần học hiện tại"
          >
            {batchRunning ? `⏸ Dừng ${batchProgress.split('—')[0].trim()}` : '🚀 Tạo 10 bài AI'}
          </button>
        </div>

        {/* Mobile-only Info Card */}
        <div className="card-sm" style={{ 
          marginBottom: 20, 
          borderLeft: `4px solid ${trackObj?.color || 'var(--accent)'}`,
          background: 'var(--surface2)',
          display: 'block'
        }} id="mobile-track-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>{trackObj?.label}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>• {TRACK_INFO[track]?.desc}</span>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div><strong style={{ color: 'var(--accent)' }}>Cốt lõi:</strong> {TRACK_INFO[track]?.core}</div>
            <div><strong style={{ color: 'var(--green)' }}>Dùng cho:</strong> {TRACK_INFO[track]?.use}</div>
          </div>
        </div>
        </>
      )}

      {mode === 'code' && (
        <>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {TRACKS.map(t => (
            <div key={t.id} className="track-wrapper">
              <button onClick={() => setCodeLang(t.id)} style={{
                padding: '7px 10px', borderRadius: 8, border: '1px solid',
                borderColor: codeLang === t.id ? t.color : 'var(--border)',
                background: codeLang === t.id ? t.color + '22' : 'var(--surface)',
                color: codeLang === t.id ? t.color : 'var(--muted)',
                fontSize: 13, cursor: 'pointer', fontWeight: codeLang === t.id ? 700 : 400,
              }}>{t.label}</button>

              <div className="track-tooltip" style={{ borderColor: t.color }}>
                <span className="tooltip-title" style={{ color: t.color }}>{t.label}</span>
                <span className="tooltip-desc">{TRACK_INFO[t.id]?.desc || 'Đang cập nhật...'}</span>
                <span className="tooltip-item"><strong>Cốt lõi:</strong> {TRACK_INFO[t.id]?.core || '...'}</span>
                <span className="tooltip-item"><strong>Dùng cho:</strong> {TRACK_INFO[t.id]?.use || '...'}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile-only Info Card for Code Mode */}
        <div className="card-sm" style={{ 
          marginBottom: 20, 
          borderLeft: `4px solid ${TRACKS.find(t=>t.id===codeLang)?.color || 'var(--accent)'}`,
          background: 'var(--surface2)'
        }}>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{TRACKS.find(t=>t.id===codeLang)?.label}</div>
            <div>{TRACK_INFO[codeLang]?.desc}</div>
            <div style={{ fontSize: 11, marginTop: 4 }}><strong style={{ color: 'var(--accent)' }}>Cốt lõi:</strong> {TRACK_INFO[codeLang]?.core}</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
            {TRACKS.find(t => t.id === codeLang)?.label || codeLang}
          </div>
          <textarea placeholder='Paste code hoặc mô tả yêu cầu...' value={codeInput} onChange={(e)=>setCodeInput(e.target.value)} style={{ width: '100%', minHeight: 180, padding: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical', marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1, height: 44 }} onClick={explainCode} disabled={loading || !codeInput.trim()}>
              {loading && activeCodeMode==='explain' ? '⏳ Phân tích...' : '💬 Giải thích'}
            </button>
            <button className="btn btn-primary" style={{ flex: 1, height: 44 }} onClick={generateCode} disabled={loading || !codeInput.trim()}>
              {loading && activeCodeMode==='generate' ? '⏳ Tạo...' : '✨ Tạo code'}
            </button>
          </div>
        </div>

        {codeExplanation && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>💡 Giải thích</div>
            <div style={{ textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: renderContent(codeExplanation, 'explain') }} />
          </div>
        )}

        {codeExample && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>✨ Code Mẫu</div>
            <div style={{ textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: renderContent(codeExample, 'example') }} />
          </div>
        )}

        {mounted && (
          <div className="card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div className="section-title" style={{ margin:0 }}>📋 Lịch sử ({codeSessions.length})</div>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
              {codeSessions.length === 0 ? (
                <div style={{color:'var(--muted)', fontSize:13, padding:10}}>Chưa có lịch sử.</div>
              ) : (
                codeSessions.map((session, i) => (
                  <div key={session.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px', borderBottom:'1px solid var(--surface2)', borderRadius:8, transition:'background 0.15s', background:'transparent' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <div onClick={() => {
                      setCodeInput(session.input);
                      setCodeLang(session.track);
                      if (session.type === 'explain') {
                        setActiveCodeMode('explain');
                        setCodeExplanation(session.output);
                      } else {
                        setActiveCodeMode('generate');
                        setCodeExample(session.output);
                      }

                      contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }} style={{ flex:1, minWidth:0, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:28, height:28, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12,
                        background: 'var(--surface2)',
                        color: session.type === 'explain' ? '#d2a8ff' : '#58a6ff', flexShrink:0 }}>
                        {session.type === 'explain' ? '💬' : '✨'}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ color: 'var(--text)', fontSize: 12, overflow:'hidden', textOverflow:'ellipsis', fontWeight: 600, whiteSpace:'nowrap' }}>
                          {session.type === 'explain' ? 'Giải thích' : 'Tạo'} · {TRACKS.find(t=>t.id===session.track)?.label?.split(' ')[0] || session.track}
                        </div>
                        <div style={{ fontSize:10, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {session.input.slice(0, 40)}...
                        </div>
                      </div>
                    </div>
                    <button onClick={() => deleteCodeSession(session.id)} style={{ padding:'4px 6px', borderRadius:4, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:11, cursor:'pointer', flexShrink:0 }}>🗑</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        </>
      )}

      {mode === 'lesson' && (
        <>
      {/* Desktop: 2 col - lesson left, history right */}
      <div className="desktop-main-side">
        {/* LEFT: Current lesson */}
        <div>
          {current && (
            <div className="card" style={{ marginBottom: 16 }} ref={contentRef}>
              <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap: 'wrap', gap:12 }}>
                  <div style={{ flex:1, minWidth: '100%', sm: { minWidth: 0 } } as any}>
                    <h2 style={{ fontSize:18, fontWeight:900, color:'var(--accent)', margin:'0 0 4px', lineHeight:1.3 }}>{current.topic}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'var(--surface2)', color:'var(--muted)', fontWeight:600, border:'1px solid var(--border)' }}>
                        {(current.track || track).toUpperCase()}
                      </span>
                      {current.learnCount > 0 && (
                        <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'#3fb95022', color:'#3fb950', fontWeight:700, border:'1px solid #3fb95044' }}>
                          ✓ Đã học {current.learnCount} lần
                        </span>
                      )}
                      {/* TTS Provider Selector */}
                      <select 
                        value={ttsProvider} 
                        onChange={(e) => setTtsProvider(e.target.value as any)}
                        style={{ 
                          background: 'var(--surface2)', 
                          border: '1px solid var(--border)', 
                          borderRadius: 6, 
                          fontSize: 10, 
                          color: 'var(--muted)', 
                          padding: '2px 6px',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        <option value="google">👩‍🏫 Chị Google</option>
                        <option value="edge">🌐 Edge TTS</option>
                        <option value="piper">🎙️ Piper</option>
                        {isAdmin && <option value="luxtts">🔊 LuxTTS (Admin)</option>}
                        <option value="browser">📱 Thiết bị</option>
                      </select>

                      {/* Edge Voice Selector */}
                      {ttsProvider === 'edge' && (
                        <select 
                          value={edgeVoice} 
                          onChange={(e) => setEdgeVoice(e.target.value as any)}
                          style={{ 
                            background: 'var(--surface2)', 
                            border: '1px solid var(--border)', 
                            borderRadius: 6, 
                            fontSize: 10, 
                            color: 'var(--muted)', 
                            padding: '2px 6px',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          <option value="vi-VN-HoaiMyNeural">👩‍💼 Hoài My (VN)</option>
                          <option value="vi-VN-NamMinhNeural">👨‍💼 Nam Minh (VN)</option>
                          <option value="en-US-AvaNeural">👩‍💼 Ava (US)</option>
                          <option value="en-US-AndrewNeural">👨‍💼 Andrew (US)</option>
                          <option value="en-US-BrianNeural">👨‍💼 Brian (US)</option>
                        </select>
                      )}

                      {/* Lux Voice Selector */}
                      {ttsProvider === 'luxtts' && (
                        <select 
                          value={edgeVoice} 
                          onChange={(e) => setEdgeVoice(e.target.value as any)}
                          style={{ 
                            background: 'var(--surface2)', 
                            border: '1px solid var(--border)', 
                            borderRadius: 6, 
                            fontSize: 10, 
                            color: 'var(--muted)', 
                            padding: '2px 6px',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          <option value="en_female">👩‍💼 Carissa (Lux)</option>
                          <option value="en_male">👨‍💼 Dave (Lux)</option>
                          <option value="paul">👨‍💼 Paul (Lux)</option>
                        </select>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap:10, width: '100%' }} className="lesson-actions">
                    <button onClick={readContent} className="btn btn-secondary" style={{ height: 42, background: isReading ? 'var(--orange)' : undefined, color: isReading ? '#000' : undefined, borderColor: isReading ? 'var(--orange)' : undefined }}>
                      <span>{isReading ? '⏸' : '🔊'}</span> {isReading ? 'Dừng' : 'Đọc'}
                    </button>
                    <button onClick={() => { const next = !isLooping; setIsLooping(next); isLoopingRef.current = next; }} className="btn btn-secondary" style={{ height: 42, background: isLooping ? 'var(--accent)22' : undefined, color: isLooping ? 'var(--accent)' : undefined, borderColor: isLooping ? 'var(--accent)' : undefined }} title="Lặp lại">
                      <span>{isLooping ? '🔂' : '🔁'}</span> Lặp
                    </button>
                    <button onClick={() => markComplete(current.id)} className={`btn ${current.learnCount > 0 ? 'btn-secondary' : 'btn-success-premium'}`} style={{ height: 42, color: current.learnCount > 0 ? 'var(--green)' : '#000', borderColor: current.learnCount > 0 ? 'rgba(63,185,80,0.4)' : 'transparent' }} disabled={current.completed}>
                      <span>✅</span> {current.learnCount > 0 ? 'Học lại' : 'Đã học'}
                    </button>
                    <button onClick={async () => {
                        if (!confirm('Xóa bài học này?')) return;
                        await fetch('/api/lessons', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: current.id }) });
                        setCurrent(null); setQuizAnswers([]); setUserAnswers([]); await load();
                    }} className="btn btn-danger-soft" style={{ height: 42 }} title="Xóa">
                      <span>🗑</span> Xóa
                    </button>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: renderContent(current.content.replace(/## 🧠 Quiz[\s\S]*/,''), 'lesson') }} />

              {quizAnswers.length > 0 && (
                <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#d29922' }}>🧠 Quiz</div>
                  {(() => {
                    const quizSection = current.content.match(/## 🧠 Quiz[\s\S]*/)?.[0] || '';
                    const blocks = [...quizSection.matchAll(/\d+\.\s+([\s\S]*?)(?=ĐÁPÁN:[ABC])/g)];
                    return blocks;
                  })().map((match, i) => {
                    const block = match[1].trim().replace(/\*\*/g, '');
                    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
                    const question = lines[0];
                    const optLine = lines.slice(1).join(' ');
                    const optA = optLine.match(/A[).]\s*(.*?)(?=\s*B[).])/i)?.[1]?.trim() || '';
                    const optB = optLine.match(/B[).]\s*(.*?)(?=\s*C[).])/i)?.[1]?.trim() || '';
                    const optC = optLine.match(/C[).]\s*(.*?)$/i)?.[1]?.trim() || '';
                    const options = [optA, optB, optC];
                    return (
                      <div key={i} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{i+1}. {question}</div>
                        {['A','B','C'].map((opt, oi) => {
                          const optText = options[oi] || '';
                          const isSelected = userAnswers[i] === opt;
                          const isCorrect = quizAnswers[i] === opt;
                          let bg = 'var(--surface2)', border = 'var(--border)', color = 'var(--text)';
                          if (quizSubmitted) {
                            if (isCorrect) { bg = '#0d1a0e'; border = '#3fb950'; color = '#3fb950'; }
                            else if (isSelected && !isCorrect) { bg = '#1a0a0a'; border = '#f85149'; color = '#f85149'; }
                          } else if (isSelected) { bg = '#58a6ff22'; border = '#58a6ff'; }
                          return (
                            <button key={opt} onClick={() => { if (!quizSubmitted) setUserAnswers(a => { const n=[...a]; n[i]=opt; return n; }); }}
                              style={{ display:'block', width:'100%', textAlign:'left', background:bg, border:`1px solid ${border}`, borderRadius:8, padding:'10px 14px', color, fontSize:13, cursor:quizSubmitted?'default':'pointer', marginBottom:6 }}>
                              {opt}) {optText.replace(/^[ABC]\)\s*/,'')}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  {!quizSubmitted ? (
                    <button className="btn btn-success-premium" style={{ width:'100%', height:44 }} onClick={submitQuiz} disabled={userAnswers.some(a=>!a)}>
                      Nộp bài
                    </button>
                  ) : (
                    <div style={{ textAlign:'center', padding:'16px', background: score===quizAnswers.length?'#0d1a0e':'#1a0a0a', borderRadius:10, border:`1px solid ${score===quizAnswers.length?'#3fb950':'#f85149'}` }}>
                      <div style={{ fontSize:24, fontWeight:900, color: score===quizAnswers.length?'#3fb950':'#f85149' }}>
                        {score}/{quizAnswers.length} {score===quizAnswers.length?'🎉':'💪'}
                      </div>
                      <div style={{ fontSize:12, color:'var(--muted)', marginTop:6, marginBottom:12 }}>
                        {score===quizAnswers.length?'Xuất sắc! Học bài tiếp nhé.':'Xem lại và thử bài khác.'}
                      </div>
                      {!current.completed || current.learnCount < 1 ? (
                        <button className="btn btn-green" style={{ width:'100%' }} onClick={() => markComplete(current.id)}>
                          ✓ Hoàn thành bài này
                        </button>
                      ) : (
                        <button className="btn btn-ghost" style={{ width:'100%', color: '#3fb950' }} onClick={() => markComplete(current.id)}>
                          ✓ Học thêm lần nữa (Lần {current.learnCount})
                        </button>
                      )}
                      {current.completed && (
                        <div style={{ fontSize:12, color:'#3fb950', fontWeight:600 }}>✓ Bài đã hoàn thành</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {!current && !loading && (
            <div className="card" style={{ textAlign:'center', padding:'48px 24px', color:'var(--muted)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📖</div>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>Chọn bài học</div>
              <div style={{ fontSize:13 }}>Nhấn vào bài trong danh sách bên phải</div>
            </div>
          )}
        </div>

        {/* RIGHT: History filtered by Current Track */}
        <div>
          {mounted && (
            <div className="card">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <div className="section-title" style={{ margin:0 }}>📚 Lịch sử ({lessons.filter(l => l.track === track).length})</div>
              </div>
            
            <div style={{ maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
              {(() => {
                const lessonNum = (l: Lesson) => {
                  const m = l.topic.match(/B[àa]i\s*(\d+)/i);
                  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
                };
                const group = lessons.filter(l => l.track === track).sort((a,b) => {
                  const na = lessonNum(a), nb = lessonNum(b);
                  if (na !== nb) return na - nb;
                  return a.id - b.id;
                });
                if (group.length === 0) return <div style={{color:'var(--muted)', fontSize:13, padding:10}}>Chưa có bài lưu cho phần này.</div>;
                const completed = group.filter(l => l.completed).length;

                return (
                  <>
                    <div style={{ fontSize:11, color:'var(--muted)', padding:'8px', marginBottom:8, background:'var(--surface2)', borderRadius:6, textAlign:'center' }}>
                      ✅ {completed}/{group.length} bài hoàn thành
                    </div>
                    {group.map((l, i) => (
                      <div key={l.id} onClick={() => {
                        setCurrent(l);
                        setQuizMode(false); setQuizSubmitted(false); setUserAnswers([]);
                        const answers: string[] = [];
                        const ms = l.content.matchAll(/ĐÁPÁN:([ABC])/g);
                        for (const m of ms) answers.push(m[1]);
                        setQuizAnswers(answers);
                        setUserAnswers(answers.map(() => ''));

                        contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 8px', borderBottom:'1px solid var(--surface2)', cursor:'pointer', borderRadius:8, transition:'background 0.15s' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')}
                        onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                        <div style={{ width:28, height:28, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11,
                          background: l.completed ? '#3fb950' : current?.id===l.id ? '#58a6ff33' : 'var(--surface2)',
                          color: l.completed ? '#fff' : 'var(--text)', flexShrink:0 }}>
                          {l.completed ? '✓' : i+1}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ color: current?.id===l.id ? 'var(--accent)' : 'var(--text)', fontSize: 13, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontWeight: 600 }}>{l.topic}</div>
                          <div style={{ fontSize:11, color: isDue(l) ? '#d29922' : 'var(--muted)', fontWeight: isDue(l) ? 700 : 400 }}>
                            {isDue(l) ? '🔔 Đến hạn ôn' : l.nextReviewAt ? `⏱ Ôn sau ${Math.max(0, Math.ceil((new Date(l.nextReviewAt).getTime() - now) / 86400000))}d` : (l.completed ? `✅ Đã học lần ${l.learnCount || 1}` : '⏳ Chưa học')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
