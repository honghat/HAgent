import React, { useRef, useEffect } from 'react';
import { POSES, CANVAS_PREVIEW_WIDTH, CANVAS_PREVIEW_HEIGHT } from './constants.js';

export default function PreviewPanel({ scene, sceneProgress }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const prevProgRef = useRef(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs || !scene) return;

    // Skip re-draw if progress hasn't changed (edit mode)
    if (sceneProgress === null && prevProgRef.current === null && scene.type !== 'media') return;
    prevProgRef.current = sceneProgress;

    const ctx = cvs.getContext('2d');
    const W = CANVAS_PREVIEW_WIDTH, H = CANVAS_PREVIEW_HEIGHT;
    cvs.width = W;
    cvs.height = H;

    ctx.fillStyle = '#FFFDF7';
    ctx.fillRect(0, 0, W, H);

    if (scene.type === 'stick_figure' && scene.pose) {
      const cx = W / 2, cy = H / 2 - 30;
      const p = POSES.find(x => x.id === scene.pose);
      const isGhost = scene.pose === 'empty';
      const prog = sceneProgress ?? 1;

      ctx.strokeStyle = isGhost ? '#999' : '#444';
      ctx.lineWidth = isGhost ? 1.5 : 3;
      ctx.lineCap = 'round';
      if (isGhost) ctx.setLineDash([4, 4]);

      const s = 0.335;
      const headY = cy - 80 * s;

      // Draw body parts with animation progress
      const phases = [
        { draw: () => { ctx.beginPath(); ctx.arc(cx, headY, 22 * s, 0, Math.PI * 2); ctx.stroke(); }, end: 0.2 },
        { draw: () => { ctx.beginPath(); ctx.moveTo(cx, headY + 22 * s); ctx.lineTo(cx, cy + 25 * s); ctx.stroke(); }, end: 0.35 },
      ];

      const fig = {
        stand: { la: [-35, -15], ra: [35, -15] },
        think: { la: [-35, -15], ra: [20, -65] },
        point: { la: [-35, -15], ra: [65, -30] },
        wave: { la: [-35, -15], ra: [45, -95] },
        jump: { la: [-30, -105], ra: [30, -105] },
        walk: { la: [-25, -40], ra: [25, 5] },
        talk: { la: [-45, -5], ra: [45, -5] },
        listen: { la: [-35, -15], ra: [15, -70] },
        sit: { la: [-30, 0], ra: [30, 0] },
        happy: { la: [-40, -95], ra: [40, -95] },
        sad: { la: [-35, 5], ra: [35, 5] },
        meditate: { la: [-20, 15], ra: [20, 15] },
        empty: { la: [-30, 10], ra: [30, 10] },
      }[scene.pose] || { la: [-35, -15], ra: [35, -15] };

      phases.push(
        { draw: () => { ctx.beginPath(); ctx.moveTo(cx, cy + 25 * s); ctx.lineTo(cx + fig.la[0] * s, cy + 25 * s + fig.la[1] * s); ctx.stroke(); }, end: 0.5 },
        { draw: () => { ctx.beginPath(); ctx.moveTo(cx, cy + 25 * s); ctx.lineTo(cx + fig.ra[0] * s, cy + 25 * s + fig.ra[1] * s); ctx.stroke(); }, end: 0.65 },
        { draw: () => { ctx.beginPath(); ctx.moveTo(cx, cy + 25 * s); ctx.lineTo(cx - 15 * s, cy + 25 * s + 85 * s); ctx.stroke(); }, end: 0.8 },
        { draw: () => { ctx.beginPath(); ctx.moveTo(cx, cy + 25 * s); ctx.lineTo(cx + 15 * s, cy + 25 * s + 85 * s); ctx.stroke(); }, end: 1 },
      );

      for (const phase of phases) {
        if (prog >= phase.end - 0.01) {
          phase.draw();
        } else {
          // Partial draw not implemented for simplicity; draw nothing yet
          break;
        }
      }

      ctx.setLineDash([]);

      // Text with typewriter effect
      if (scene.text) {
        const textProg = Math.max(0, Math.min(1, (prog - 0.6) / 0.4));
        const chars = Math.floor(scene.text.length * textProg);
        ctx.fillStyle = '#555';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(scene.text.slice(0, chars), W / 2, H - 80);
      }

      if (p) {
        ctx.fillStyle = '#aaa';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.label, W / 2, 8);
      }
    } else if (scene.type === 'title') {
      ctx.fillStyle = '#333';
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const prog = sceneProgress ?? 1;
      const chars = scene.text ? Math.floor(scene.text.length * prog) : 0;
      ctx.fillText((scene.text || '').slice(0, chars), W / 2, H / 2);
    }
  }, [scene, sceneProgress]);

  // Sync video element for media scenes
  useEffect(() => {
    if (scene?.type === 'media' && scene?.mime?.startsWith('video') && videoRef.current) {
      if (sceneProgress != null) {
        const trimStart = scene.trimStart || 0;
        const trimEnd = scene.trimEnd ?? (videoRef.current.duration || scene.duration);
        const effective = trimEnd - trimStart;
        const target = trimStart + effective * Math.min(sceneProgress, 1);
        if (Math.abs(videoRef.current.currentTime - target) > 0.1) {
          videoRef.current.currentTime = target;
        }
      }
    }
  }, [scene, sceneProgress]);

  if (scene?.type === 'media') {
    return (
      <div className="preview-panel preview-media">
        {scene.mime?.startsWith('video') ? (
          <video ref={videoRef} src={scene.url} controls className="preview-video" />
        ) : (
          <img src={scene.url} alt={scene.filename || ''} className="preview-image" />
        )}
      </div>
    );
  }

  return (
    <div className="preview-panel">
      <canvas ref={canvasRef} className="preview-canvas" />
    </div>
  );
}
