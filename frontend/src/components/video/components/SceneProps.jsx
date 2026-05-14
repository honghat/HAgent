import React from 'react';
import { POSES, MIN_DURATION, MAX_DURATION } from './constants.js';

export default function SceneProps({ scene, onChange, selectedIdx, totalScenes, onDuplicate, onSplit }) {
  if (!scene) return <div className="props-panel"><div className="props-empty">Chọn scene để chỉnh sửa</div></div>;

  const typeLabel = {
    stick_figure: 'Người que',
    media: 'Media',
    title: 'Title',
    clear: 'Xoá',
    wait: 'Chờ',
  }[scene.type] || scene.type;

  return (
    <div className="props-panel">
      <div className="props-title">
        Chỉnh sửa scene
        <span style={{ fontSize: 11, color: 'hsl(0,0%,40%)', marginLeft: 8, fontWeight: 400 }}>
          {selectedIdx + 1}/{totalScenes}
        </span>
      </div>

      {/* Type display */}
      <div className="prop-group">
        <label className="prop-label">Kiểu</label>
        <div style={{ fontSize: 12, color: 'hsl(0,0%,70%)' }}>{typeLabel}</div>
      </div>

      {/* Media file info */}
      {scene.type === 'media' && (
        <div className="prop-group">
          <label className="prop-label">File</label>
          <div style={{ fontSize: 11, color: 'hsl(0,0%,55%)', wordBreak: 'break-all' }}>{scene.filename || scene.url || 'media'}</div>
        </div>
      )}

      {/* Stick figure pose */}
      {scene.type === 'stick_figure' && (
        <div className="prop-group">
          <label className="prop-label">Dáng</label>
          <div className="pose-grid">
            {POSES.map(p => (
              <div key={p.id} className={`pose-btn ${scene.pose === p.id ? 'active' : ''}`} onClick={() => onChange({ ...scene, pose: p.id })}>
                <span className="pose-icon">{p.icon}</span>
                <span className="pose-name">{p.label}</span>
              </div>
            ))}
          </div>

          <label className="prop-label" style={{ marginTop: 12 }}>Lời thoại</label>
          <textarea
            value={scene.text || ''}
            onChange={e => onChange({ ...scene, text: e.target.value })}
            className="prop-input prop-textarea"
            placeholder="Nhập lời thoại..."
          />
        </div>
      )}

      {/* Title text */}
      {scene.type === 'title' && (
        <div className="prop-group">
          <label className="prop-label">Nội dung</label>
          <textarea
            value={scene.text || ''}
            onChange={e => onChange({ ...scene, text: e.target.value })}
            className="prop-input prop-textarea"
            placeholder="Tiêu đề..."
          />
        </div>
      )}

      {/* Duration slider */}
      <div className="prop-group">
        <label className="prop-label">Thời gian (giây)</label>
        <div className="prop-dur-row">
          <input type="range" min={MIN_DURATION} max={MAX_DURATION} step="0.5" value={scene.duration || 3}
            onChange={e => onChange({ ...scene, duration: parseFloat(e.target.value) })} className="prop-slider" />
          <span className="prop-dur-val">{scene.duration || 3}s</span>
        </div>
      </div>

      {/* Volume (Phase 6) */}
      <div className="prop-group">
        <label className="prop-label">Âm lượng</label>
        <div className="prop-dur-row">
          <input type="range" min="0" max="100" value={scene.volume ?? 100}
            onChange={e => onChange({ ...scene, volume: parseInt(e.target.value) })}
            className="prop-slider" />
          <span className="prop-dur-val">{scene.volume ?? 100}%</span>
        </div>
      </div>

      {/* Speed (Phase 6) */}
      <div className="prop-group">
        <label className="prop-label">Tốc độ</label>
        <div className="prop-dur-row">
          <input type="range" min="0.5" max="4" step="0.25" value={scene.speed ?? 1}
            onChange={e => onChange({ ...scene, speed: parseFloat(e.target.value) })}
            className="prop-slider" />
          <span className="prop-dur-val">{scene.speed ?? 1}x</span>
        </div>
      </div>

      {/* Action buttons (Phase 6) */}
      <div className="prop-group prop-actions">
        {onDuplicate && (
          <button className="btn-action" onClick={() => onDuplicate(selectedIdx)}>
            [+] Nhân đôi
          </button>
        )}
        {scene.type === 'media' && onSplit && (
          <button className="btn-action" onClick={() => onSplit(selectedIdx)}>
            [/] Cắt scene
          </button>
        )}
      </div>
    </div>
  );
}
