'use client';
import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';

const WORK_MIN = 50, BREAK_MIN = 10;

let _actx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    if (!_actx || _actx.state === 'closed') {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      _actx = new AC();
    }
    return _actx;
  } catch { return null; }
}

export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

async function beep(type: 'work' | 'break') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') await ctx.resume();
    (type === 'work' ? [523, 659, 784] : [784, 659, 523]).forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.4);
      o.start(ctx.currentTime + i * 0.25);
      o.stop(ctx.currentTime + i * 0.25 + 0.4);
    });
  } catch { /**/ }
}

function getUserId(): string | null {
  if (typeof document === 'undefined') return null;
  return (document.cookie.match(/userId=([^;]+)/)?.[1] ?? localStorage.getItem('userId') ?? null);
}

interface TimerCtx {
  isWork: boolean; secs: number; running: boolean; session: number;
  todaySessions: number; toggle: ()=>void; reset: ()=>void; switchMode: (w:boolean)=>void; setTime: (s:number)=>void;
}

const Ctx = createContext<TimerCtx|null>(null);
export const useTimer = () => { const c = useContext(Ctx); if (!c) throw new Error('useTimer'); return c; };

export function TimerProvider({ children }: { children: ReactNode }) {
  const [isWork, setIsWork] = useState(true);
  const [secs, setSecs] = useState(WORK_MIN*60);
  const [running, setRunning] = useState(false);
  const [session, setSession] = useState(0);
  const [todaySessions, setTodaySessions] = useState(0);

  const timerRef = useRef<NodeJS.Timeout|null>(null);
  const isSyncing = useRef(false);
  const isCompletingWork = useRef(false);
  const wakeLockRef = useRef<any>(null);

  const getToday = () => new Date().toLocaleDateString('en-CA');

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch(`/api/pomodoro?date=${getToday()}`);
      if (res.ok) {
        const data = await res.json();
        setTodaySessions(data.sessions || 0);
        return data;
      }
    } catch { /**/ }
    return null;
  }, []);

  // Wake Lock: Giữ màn hình không tắt khi timer chạy
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('🔒 Wake Lock active');
      }
    } catch (err) {
      console.log('Wake Lock not supported or denied');
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('🔓 Wake Lock released');
      } catch { /**/ }
    }
  }, []);

  const sync = useCallback(async () => {
    if (isSyncing.current) return;
    isSyncing.current = true;

    try {
      const data = await fetchLatest();
      if (!data) return;

      const now = Date.now();
      const serverEndTime = Number(data.currentEndTime || 0);
      const serverMode = data.currentMode === 'work';

      // 1. Nếu server đang chạy và thời gian kết thúc ở tương lai
      if (serverEndTime > now) {
        const rem = Math.round((serverEndTime - now) / 1000);

        // LOGIC ƯU TIÊN THỜI GIAN THẤP HƠN:
        // Cập nhật nếu:
        // - Khác chế độ (Work/Break)
        // - Hoặc Local đang tắt
        // - Hoặc Server báo thời gian CÒN LẠI THẤP HƠN (nhanh hơn) Local đáng kể (> 5s)
        const isFasterOnServer = rem < secs - 5;
        const needsUpdate = !running || (isWork !== serverMode) || isFasterOnServer;

        if (needsUpdate) {
          setIsWork(serverMode);
          setSecs(rem);
          setRunning(true);
        }
      }
      // 2. Nếu server báo dừng (endTime = 0 hoặc đã qua) nhưng local vẫn chạy
      else if (serverEndTime === 0 || serverEndTime <= now) {
        // Chỉ dừng nếu local đang chạy
        if (running) {
          setRunning(false);
          // GIỮ NGUYÊN thời gian hiện tại, KHÔNG reset
        }
      }
    } finally {
      isSyncing.current = false;
    }
  }, [fetchLatest, running, isWork, secs]);

  // Sync định kỳ và khi tab active
  useEffect(() => {
    sync();
    const id = setInterval(sync, 5000);
    const handleVisible = () => { if (document.visibilityState === 'visible') sync(); };
    window.addEventListener('visibilitychange', handleVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener('visibilitychange', handleVisible);
    };
  }, [sync]);

  const saveState = useCallback(async (w: boolean, r: boolean, sCount?: number, remainingSecs?: number) => {
    // Nếu đang chạy (r=true), dùng remainingSecs nếu có, không thì dùng full time
    const timeToUse = remainingSecs !== undefined ? remainingSecs : (w ? WORK_MIN * 60 : BREAK_MIN * 60);
    const endTime = r ? Date.now() + timeToUse * 1000 : 0;
    try {
      await fetch('/api/auth'); // Dummy call to keep session alive if needed
      await fetch('/api/pomodoro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: getToday(),
          sessions: sCount,
          currentEndTime: endTime,
          currentMode: w ? 'work' : 'break',
          userId: getUserId(),
        }),
      });
    } catch { /**/ }
  }, []);

  // Tự động chạy khi vào web lần đầu (nếu server không có phiên active)
  useEffect(() => {
    fetchLatest().then(data => {
      const now = Date.now();
      const serverEndTime = Number(data?.currentEndTime || 0);
      if (serverEndTime <= now) {
        setIsWork(true);
        setSecs(WORK_MIN * 60);
        setRunning(true);
        saveState(true, true, undefined, WORK_MIN * 60);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown logic ổn định hơn
  useEffect(() => {
    if (!running) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setSecs(s => {
        if (s <= 1) {
          // Xử lý khi hết giờ
          if (isWork) {
            // Ngăn chặn gọi nhiều lần
            if (isCompletingWork.current) return BREAK_MIN * 60;
            isCompletingWork.current = true;

            beep('work');
            fetchLatest().then(data => {
              // KHÓA BẢO VỆ: Nếu server đã báo hết giờ (endTime=0) hoặc số phiên trên server
              // đã lớn hơn hoặc bằng local + 1, nghĩa là có thiết bị khác đã ghi nhận rồi.
              const serverSessions = data?.sessions ?? todaySessions;
              const serverEndTime = Number(data?.currentEndTime ?? 0);
              const expectedNext = todaySessions + 1;

              if (serverSessions >= expectedNext || serverEndTime === 0) {
                // Server đã có phiên này rồi, chỉ sync state
                setTodaySessions(serverSessions);
                setIsWork(false);
                setRunning(false);
                setSession(p => p + 1);
                isCompletingWork.current = false;
                return;
              }

              // Chỉ tăng nếu server chưa có phiên này
              setTodaySessions(expectedNext);
              saveState(false, false, expectedNext);
              fetch('/api/logs', {
                method:'PATCH',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ date: getToday(), addHours: 0.5, addTopic: 'Pomodoro' })
              }).finally(() => {
                isCompletingWork.current = false;
              });
            });
            setIsWork(false);
            setRunning(false);
            setSession(p => p + 1);
            return BREAK_MIN * 60;
          } else {
            beep('break');
            setIsWork(true);
            setRunning(false);
            saveState(true, false);
            return WORK_MIN * 60;
          }
        }
        return s - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running, isWork, todaySessions, fetchLatest, saveState]);

  // Cập nhật tiêu đề trang và Wake Lock
  useEffect(() => {
    if (running) {
      const mm = String(Math.floor(secs/60)).padStart(2,'0');
      const ss = String(secs%60).padStart(2,'0');
      document.title = `${isWork?'🔴':'🟢'} ${mm}:${ss} — NewHat`;
      requestWakeLock(); // Giữ màn hình không tắt
    } else {
      document.title = 'NewHat — 60 Ngày Thay Đổi';
      releaseWakeLock(); // Cho phép màn hình tắt
    }
  }, [secs, running, isWork, requestWakeLock, releaseWakeLock]);

  return (
    <Ctx.Provider value={{
      isWork, secs, running, session, todaySessions,
      toggle: () => {
        unlockAudio();
        setRunning(r => {
          const nextR = !r;
          // Truyền secs hiện tại khi resume
          saveState(isWork, nextR, undefined, secs);
          return nextR;
        });
      },
      reset: () => {
        setRunning(false);
        setSecs(isWork ? WORK_MIN * 60 : BREAK_MIN * 60);
        saveState(isWork, false);
      },
      switchMode: (toWork) => {
        setIsWork(toWork);
        setSecs(toWork ? WORK_MIN * 60 : BREAK_MIN * 60);
        setRunning(false);
        saveState(toWork, false);
      },
      setTime: (newSecs) => {
        if (!running) {
          setSecs(newSecs);
        }
      },
    }}>
      {children}
    </Ctx.Provider>
  );
}
