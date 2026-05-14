'use client';
import React, { useMemo, useState } from 'react';
import { LEVEL_COLORS, UNIT_CURRICULUM } from '../constants';

interface EngLesson {
  id: number;
  type: string;
  content: string;
  metadata: string;
  completed: boolean;
  learnCount: number;
  createdAt: string;
  nextReviewAt?: string | null;
  title?: string;
}

interface Props {
  history: EngLesson[];
  loadLesson: (item: EngLesson) => void;
  deleteUnit: (unitNum: number | number[], level: string) => void;
  startNewLesson: (level: string, unitNum: number, skillType: string, unitTitle: string) => void;
  historyLoading: boolean;
}

const SKILL_TYPES = [
  { id: 'listen',  label: '🎧 Nghe',     dbType: 'listen' },
  { id: 'speak',   label: '🎤 Nói',      dbType: 'speak' },
  { id: 'read',    label: '📖 Đọc',      dbType: 'reading' },
  { id: 'write',   label: '✍️ Viết',     dbType: 'writing' },
  { id: 'vocab',   label: '📚 Từ vựng',  dbType: 'vocab' },
  { id: 'grammar', label: '📐 Ngữ pháp', dbType: 'grammar' },
] as const;

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1'];

function parseMeta(raw: string) {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

export default function CurriculumTab({ history, loadLesson, deleteUnit, startNewLesson, historyLoading }: Props) {
  const [activeLevel, setActiveLevel] = useState<string>('A1');
  const [hoveredUnit, setHoveredUnit] = useState<string | null>(null);

  // Group existing lessons by level and unit
  const historyMap = useMemo(() => {
    const map = new Map<string, Record<string, EngLesson[]>>();
    
    for (const item of history) {
      const m = parseMeta(item.metadata);
      const level = m.level || 'A1';
      const unit = m.unit ? Number(m.unit) : 0;
      
      if (!unit) continue;
      
      const key = `${level}-${unit}`;
      if (!map.has(key)) map.set(key, {});
      const skills = map.get(key)!;
      if (!skills[item.type]) skills[item.type] = [];
      skills[item.type].push(item);
    }
    return map;
  }, [history]);

  if (historyLoading) {
    return (
      <div className="card fade-in" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: 14 }}>Đang tải danh sách bài học...</div>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Level Selector */}
      <div className="card" style={{ padding: '12px', display: 'flex', gap: '8px', overflowX: 'auto', background: 'var(--surface)' }}>
        {LEVEL_ORDER.map(lv => (
          <button
            key={lv}
            onClick={() => setActiveLevel(lv)}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: 'none',
              background: activeLevel === lv ? LEVEL_COLORS[lv] : 'transparent',
              color: activeLevel === lv ? '#0d1117' : 'var(--muted)',
              fontWeight: 800,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              boxShadow: activeLevel === lv ? `0 4px 12px ${LEVEL_COLORS[lv]}44` : 'none'
            }}
          >
            Trình độ {lv}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: '24px' }}>
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <span style={{ fontSize: '24px' }}>🗺️</span>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-main)' }}>Lộ trình học {activeLevel}</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>Hoàn thành 10 bài học để nâng cấp trình độ</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(UNIT_CURRICULUM[activeLevel] || []).map((unit, index) => {
            const unitNum = index + 1;
            const key = `${activeLevel}-${unitNum}`;
            const skills = historyMap.get(key) || {};
            const color = LEVEL_COLORS[activeLevel];

            // Calculate progress
            const skillsCompleted = SKILL_TYPES.filter(s => {
              const items = skills[s.dbType];
              return items && items.some(i => i.learnCount > 0);
            }).length;

            return (
              <div
                key={key}
                onMouseEnter={() => setHoveredUnit(key)}
                onMouseLeave={() => setHoveredUnit(null)}
                style={{
                  background: 'var(--surface2)',
                  border: `1px solid ${skillsCompleted === 6 ? color + '66' : 'var(--border)'}`,
                  borderRadius: '16px',
                  padding: '20px',
                  transition: 'all 0.2s',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {skillsCompleted === 6 && (
                  <div style={{
                    position: 'absolute', top: 0, right: 0,
                    background: color, color: '#0d1117',
                    padding: '4px 12px', fontSize: '10px', fontWeight: 900,
                    borderBottomLeftRadius: '12px'
                  }}>HOÀN THÀNH</div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ color: color, fontWeight: 900, fontSize: '12px' }}>BÀI {unitNum}</span>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--muted)' }} />
                      <span style={{ color: 'var(--muted)', fontSize: '12px', fontWeight: 600 }}>{unit.scenario}</span>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>{unit.title}</div>
                  </div>
                  
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: color, opacity: 0.2 }}>{unitNum.toString().padStart(2, '0')}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                  {SKILL_TYPES.map(skill => {
                    const items = skills[skill.dbType];
                    const rep = items && items.length > 0 ? items.reduce((best, cur) => 
                      new Date(cur.createdAt) > new Date(best.createdAt) ? cur : best
                    ) : null;
                    const done = items && items.some(i => i.learnCount > 0);

                    return (
                      <button
                        key={skill.id}
                        onClick={() => {
                          if (rep) {
                            loadLesson(rep);
                          } else {
                            startNewLesson(activeLevel, unitNum, skill.id, unit.title);
                          }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '10px 12px', borderRadius: '10px',
                          background: rep ? (done ? color + '15' : 'var(--surface)') : 'rgba(255,255,255,0.02)',
                          border: '1px solid',
                          borderColor: rep ? (done ? color : color + '44') : 'var(--border)',
                          color: rep ? (done ? color : 'var(--text-main)') : 'var(--muted)',
                          cursor: 'pointer',
                          fontSize: '13px', fontWeight: 700,
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>{skill.label.split(' ')[0]}</span>
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div style={{ lineHeight: 1 }}>{skill.label.split(' ')[1]}</div>
                          {done && <div style={{ fontSize: '9px', marginTop: '2px', color: color }}>Đã học ✓</div>}
                          {!rep && <div style={{ fontSize: '9px', marginTop: '2px' }}>Bắt đầu →</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Info Bar */}
                <div style={{ 
                  marginTop: '16px', paddingTop: '16px', 
                  borderTop: '1px solid var(--border)', 
                  display: 'flex', gap: '20px', fontSize: '11px' 
                }}>
                  <div>
                    <span style={{ color: 'var(--muted)' }}>Ngữ pháp: </span>
                    <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{unit.grammar}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--muted)' }}>Từ vựng: </span>
                    <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{unit.vocab}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
