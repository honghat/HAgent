export const POSES = [
  { id: 'stand', label: 'Đứng' },
  { id: 'think', label: 'Suy nghĩ' },
  { id: 'point', label: 'Chỉ tay' },
  { id: 'wave', label: 'Vẫy tay' },
  { id: 'jump', label: 'Nhảy' },
  { id: 'walk', label: 'Đi bộ' },
  { id: 'talk', label: 'Nói' },
  { id: 'listen', label: 'Lắng nghe' },
  { id: 'sit', label: 'Ngồi' },
  { id: 'happy', label: 'Vui vẻ' },
  { id: 'sad', label: 'Buồn' },
  { id: 'meditate', label: 'Thiền' },
  { id: 'empty', label: 'Trống' },
];

export const PIXELS_PER_SECOND = 80;
export const MIN_CLIP_WIDTH = 40;
export const TIMELINE_RULER_HEIGHT = 28;
export const PLAYHEAD_WIDTH = 2;
export const MAX_DURATION = 10;
export const MIN_DURATION = 0.5;

export const CANVAS_PREVIEW_WIDTH = 360;
export const CANVAS_PREVIEW_HEIGHT = 640;

export function genId() { return Date.now() + '-' + Math.random().toString(36).slice(2, 6); }
