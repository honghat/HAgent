import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

export function usePlayback({ scenes, transitions, onSceneChange }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [sceneProgress, setSceneProgress] = useState(null);

  const rafRef = useRef(null);
  const startWallRef = useRef(0);
  const startTimeRef = useRef(0);
  const scenesRef = useRef(scenes);
  const transitionsRef = useRef(transitions);
  scenesRef.current = scenes;
  transitionsRef.current = transitions;

  const totalDuration = useMemo(() => {
    let t = 0;
    for (let i = 0; i < scenes.length; i++) {
      t += scenes[i].duration || 3;
    }
    return t;
  }, [scenes]);

  const getPlayheadInfo = useCallback((time) => {
    let accum = 0;
    for (let i = 0; i < scenesRef.current.length; i++) {
      const dur = scenesRef.current[i].duration || 3;
      if (time >= accum && time < accum + dur) {
        return { idx: i, progress: dur > 0 ? (time - accum) / dur : 1 };
      }
      accum += dur;
    }
    return { idx: Math.max(0, scenesRef.current.length - 1), progress: 1 };
  }, []);

  const tick = useCallback(() => {
    const elapsed = (performance.now() - startWallRef.current) / 1000;
    const time = startTimeRef.current + elapsed;
    const total = totalDuration;

    if (time >= total || scenesRef.current.length === 0) {
      setPlaying(false);
      setCurrentTime(total);
      setSceneProgress(1);
      onSceneChange?.(Math.max(0, scenesRef.current.length - 1));
      return;
    }

    setCurrentTime(time);
    const info = getPlayheadInfo(time);
    setSceneProgress(info.progress);
    onSceneChange?.(info.idx);
    rafRef.current = requestAnimationFrame(tick);
  }, [totalDuration, getPlayheadInfo, onSceneChange]);

  const play = useCallback(() => {
    if (scenes.length === 0) return;
    if (currentTime >= totalDuration) {
      startWallRef.current = performance.now();
      startTimeRef.current = 0;
    } else {
      startWallRef.current = performance.now();
      startTimeRef.current = currentTime;
    }
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [scenes.length, currentTime, totalDuration, tick]);

  const pause = useCallback(() => {
    setPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    pause();
    setCurrentTime(0);
    setSceneProgress(null);
    onSceneChange?.(0);
  }, [pause, onSceneChange]);

  const seek = useCallback((time) => {
    const clamped = Math.max(0, Math.min(time, totalDuration));
    setCurrentTime(clamped);
    const info = getPlayheadInfo(clamped);
    setSceneProgress(info.progress);
    onSceneChange?.(info.idx);
    if (playing) {
      startWallRef.current = performance.now();
      startTimeRef.current = clamped;
    }
  }, [totalDuration, getPlayheadInfo, onSceneChange, playing]);

  useEffect(() => {
    if (scenes.length === 0 && playing) pause();
  }, [scenes.length, playing, pause]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    playing, currentTime, sceneProgress, totalDuration,
    play, pause, stop, seek,
  };
}
