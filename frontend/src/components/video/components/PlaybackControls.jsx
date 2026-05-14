import React from 'react';
import { Play, Pause, Square } from 'lucide-react';

function fmt(t) {
  if (!t || t < 0) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PlaybackControls({ playing, onPlay, onPause, onStop, currentTime, totalDuration }) {
  return (
    <div className="pb-controls">
      <button className="pb-btn" onClick={playing ? onPause : onPlay} title={playing ? 'Tạm dừng' : 'Phát'}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button className="pb-btn" onClick={onStop} title="Dừng">
        <Square size={12} />
      </button>
      <span className="pb-time">{fmt(currentTime)}</span>
      <span className="pb-sep">/</span>
      <span className="pb-time pb-total">{fmt(totalDuration)}</span>
    </div>
  );
}
