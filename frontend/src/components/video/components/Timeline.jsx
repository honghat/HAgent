import React, { useRef, useState, useCallback, useEffect } from 'react';
import { PIXELS_PER_SECOND, MIN_CLIP_WIDTH, PLAYHEAD_WIDTH, TIMELINE_RULER_HEIGHT, POSES } from './constants.js';

function getBlockWidth(scene) {
  const dur = (scene.duration || 3) / (scene.speed || 1);
  return Math.max(MIN_CLIP_WIDTH, dur * PIXELS_PER_SECOND);
}

function getMediaIcon(mime) {
  if (!mime) return 'Im';
  return mime.startsWith('video') ? 'Vd' : 'Im';
}

function getSceneIcon(scene) {
  if (scene.type === 'clear') return 'Cl';
  if (scene.type === 'wait') return '..';
  if (scene.type === 'title') return 'Ti';
  if (scene.type === 'media') return getMediaIcon(scene.mime);
  const abbr = { stand:'St', think:'Th', point:'Pt', wave:'Wv', jump:'Jm', walk:'Wk', talk:'Tk', listen:'Ls', sit:'Si', happy:'Hp', sad:'Sd', meditate:'Md', empty:'Em' };
  return abbr[scene.pose] || '??';
}

export default function Timeline({
  scenes, transitions, selectedIdx, currentTime, playing, totalDuration,
  onSelect, onReorder, onDelete, onSeek, onDropFromSource,
}) {
  const dragRef = useRef(null);
  const timelineRef = useRef(null);
  const [dropIdx, setDropIdx] = useState(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  // --- Scene drag-reorder (kept from original) ---
  const handleDragStart = (idx, e) => {
    dragRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.target.style.opacity = 0.5;
  };
  const handleDragOver = (idx, e) => {
    e.preventDefault();
    if (dragRef.current === null || dragRef.current === idx) return;
    onReorder(dragRef.current, idx);
    dragRef.current = idx;
  };
  const handleDragEnd = (e) => {
    dragRef.current = null;
    setDropIdx(null);
    e.target.style.opacity = 1;
  };

  const handleContainerDragOver = (e) => {
    if (e.dataTransfer.types.includes('scene-template')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
      let idx = scenes.length;
      const blocks = timelineRef.current.querySelectorAll('.clip-block');
      blocks.forEach((block, i) => {
        const br = block.getBoundingClientRect();
        const blockMid = br.left - rect.left + br.width / 2 + timelineRef.current.scrollLeft;
        if (x > blockMid) idx = i + 1;
      });
      setDropIdx(idx);
    }
  };
  const handleContainerDragLeave = (e) => {
    if (!timelineRef.current.contains(e.relatedTarget)) setDropIdx(null);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setDropIdx(null);
    const raw = e.dataTransfer.getData('scene-template');
    if (!raw) return;
    const template = JSON.parse(raw);
    let scene;
    if (template.type === 'media') {
      scene = { _id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), type: 'media', url: template.url, mime: template.mime, filename: template.filename, duration: 3, volume: 100, speed: 1 };
    } else if (template.type === 'stick_figure') {
      scene = { _id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), type: 'stick_figure', pose: template.pose || 'stand', text: '', duration: 3, volume: 100, speed: 1 };
    } else {
      scene = { _id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), type: template.type, duration: template.type === 'clear' ? 0.5 : 2, volume: 100, speed: 1 };
    }
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const blocks = timelineRef.current.querySelectorAll('.clip-block');
    let idx = scenes.length;
    blocks.forEach((block, i) => {
      const br = block.getBoundingClientRect();
      const blockMid = br.left - rect.left + br.width / 2 + timelineRef.current.scrollLeft;
      if (x > blockMid) idx = i + 1;
    });
    onDropFromSource(scene, idx);
  };

  // --- Playhead drag ---
  const getTimeFromMouse = useCallback((e) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
    return Math.max(0, Math.min(x / PIXELS_PER_SECOND, totalDuration || 100));
  }, [totalDuration]);

  const handlePlayheadMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPlayhead(true);
  }, []);

  useEffect(() => {
    if (!isDraggingPlayhead) return;
    const handleMove = (e) => { onSeek(getTimeFromMouse(e)); };
    const handleUp = () => setIsDraggingPlayhead(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [isDraggingPlayhead, getTimeFromMouse, onSeek]);

  // Click on timeline content area to seek
  const handleTimelineClick = useCallback((e) => {
    if (e.target.closest('.clip-block') || e.target.closest('.playhead') || e.target.closest('.clip-add')) return;
    onSeek(getTimeFromMouse(e));
  }, [getTimeFromMouse, onSeek]);

  // --- Ruler ticks ---
  const rulerTicks = [];
  if (totalDuration > 0) {
    const totalPx = totalDuration * PIXELS_PER_SECOND;
    for (let s = 0; s <= Math.ceil(totalDuration); s++) {
      const x = s * PIXELS_PER_SECOND;
      rulerTicks.push(
        <React.Fragment key={s}>
          <div className="ruler-tick" style={{ left: x, height: s % 5 === 0 ? 10 : 6 }} />
          {s % 5 === 0 && (
            <div className="ruler-label" style={{ left: x }}>{s}</div>
          )}
        </React.Fragment>
      );
    }
  }

  const playheadX = currentTime != null ? currentTime * PIXELS_PER_SECOND : 0;

  return (
    <div className="clip-timeline" ref={timelineRef}>
      {/* Time ruler */}
      <div className="timeline-ruler">
        {rulerTicks}
      </div>

      {/* Playhead */}
      <div className="playhead" style={{ left: playheadX }}>
        <div className="playhead-handle" onMouseDown={handlePlayheadMouseDown} />
      </div>

      {/* Scene blocks container */}
      <div className="timeline-content" onClick={handleTimelineClick}
        onDragOver={handleContainerDragOver}
        onDragLeave={handleContainerDragLeave}
        onDrop={handleDrop}
      >
        {scenes.map((s, i) => {
          const w = getBlockWidth(s);
          const isMedia = s.type === 'media';
          const icon = getSceneIcon(s);
          const label = s.type === 'media' ? (s.filename || 'media').slice(0, 10) : (s.text || s.type || '').slice(0, 14);
          const effDur = ((s.duration || 3) / (s.speed || 1));

          return (
            <div key={s._id}
              className={`clip-block ${i === selectedIdx ? 'active' : ''} ${isMedia ? 'clip-media' : ''}`}
              style={{ width: w, minWidth: MIN_CLIP_WIDTH }}
              onClick={() => onSelect(i)}
              draggable
              onDragStart={e => handleDragStart(i, e)}
              onDragOver={e => handleDragOver(i, e)}
              onDragEnd={handleDragEnd}
            >
              <div className="clip-icon">{icon}</div>
              <div className="clip-label">{label}</div>
              <div className="clip-dur">{effDur.toFixed(1)}s</div>
              {s.speed && s.speed !== 1 && <div className="clip-badge">{s.speed}x</div>}
              <button className="clip-del" onClick={e => { e.stopPropagation(); onDelete(i); }}>×</button>
            </div>
          );
        })}
        {dropIdx !== null && <div className="drop-indicator" />}
        <div className="clip-add" onClick={() => onSelect(scenes.length)}>+</div>
      </div>
    </div>
  );
}
