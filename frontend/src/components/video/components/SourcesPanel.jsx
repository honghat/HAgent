import React, { useRef } from 'react';
import { POSES } from './constants.js';

function PoseIcon({ poseId }) {
  const abbr = {
    stand: 'St', think: 'Th', point: 'Pt', wave: 'Wv',
    jump: 'Jm', walk: 'Wk', talk: 'Tk', listen: 'Ls',
    sit: 'Si', happy: 'Hp', sad: 'Sd', meditate: 'Md', empty: 'Em',
  }[poseId] || '??';
  return <span className="source-icon-shape">{abbr}</span>;
}

export default function SourcesPanel({ onDropTemplate, mediaFiles, onImport, uploading }) {
  const fileRef = useRef(null);

  const handleDragStart = (type, extra, e) => {
    e.dataTransfer.setData('scene-template', JSON.stringify({ type, ...extra }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const builtinItems = [
    ...POSES.map(p => ({ id: p.id, icon: <PoseIcon poseId={p.id} />, label: p.label, type: 'stick_figure', extra: { pose: p.id } })),
    { id: 'title', icon: <span className="source-icon-shape">Ti</span>, label: 'Title', type: 'title', extra: {} },
    { id: 'wait', icon: <span className="source-icon-shape">⏱</span>, label: 'Chờ', type: 'wait', extra: {} },
    { id: 'clear', icon: <span className="source-icon-shape">Cl</span>, label: 'Xoá', type: 'clear', extra: {} },
  ];

  return (
    <div className="source-panel-scroll">
      <div className="source-section-label">Nhân vật</div>
      <div className="source-grid">
        {builtinItems.map(item => (
          <div
            key={item.id}
            className="source-item"
            draggable
            onDragStart={e => handleDragStart(item.type, item.extra, e)}
            onClick={() => onDropTemplate(item.type, item.extra)}
          >
            <span className="source-icon">{item.icon}</span>
            <span className="source-label">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="source-section-label" style={{ marginTop: 10 }}>Media</div>
      <div className="source-import-row" onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={onImport} />
        <span className="source-import-btn">{uploading ? '...' : '+'} Import</span>
      </div>
      {mediaFiles.length > 0 && (
        <div className="source-grid" style={{ marginTop: 4 }}>
          {mediaFiles.map((f, i) => (
            <div
              key={i}
              className="source-item"
              draggable
              onDragStart={e => handleDragStart('media', { url: f.url, mime: f.mime, filename: f.name }, e)}
              onClick={() => onDropTemplate('media', { url: f.url, mime: f.mime, filename: f.name })}
            >
              <span className="source-icon">
                {f.mime?.startsWith('video') ? <span className="source-icon-shape">Vd</span> : <span className="source-icon-shape">Im</span>}
              </span>
              <span className="source-label">{f.name?.slice(0, 12) || 'file'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
