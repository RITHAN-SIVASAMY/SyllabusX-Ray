/**
 * Scheduler Page - Cram Countdown Planner (Mode-Aware)
 * Full mode-specific schedule with per-topic details, tips, and export.
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useStudyMode } from '@/hooks/useStudyMode';
import { generateSchedule } from '@/lib/api';
import type { ScheduleDay } from '@/types';
import CourseSelector from '@/components/CourseSelector';

interface ScheduleInfo {
  total_days: number;
  total_hours: number;
  study_hours: number;
  review_hours: number;
  topics_covered: number;
  mode_summary?: {
    label: string;
    description: string;
    session_strategy: string;
    color: 'danger' | 'warning' | 'primary';
  };
}

export default function SchedulerPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { mode, setMode, config } = useStudyMode();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course');

  const [examDate, setExamDate] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState(4);
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [scheduleInfo, setScheduleInfo] = useState<ScheduleInfo | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [daysUntilExam, setDaysUntilExam] = useState<number | null>(null);

  useEffect(() => { if (!authLoading && !isAuthenticated) router.push('/'); }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (examDate) {
      const diffTime = new Date(examDate).getTime() - Date.now();
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      Promise.resolve().then(() => setDaysUntilExam(days));
    } else {
      Promise.resolve().then(() => setDaysUntilExam(null));
    }
  }, [examDate]);

  const handleGenerate = async () => {
    if (!courseId || !examDate) { setError('Please select an exam date'); return; }
    setGenerating(true); setError('');
    try {
      const result = await generateSchedule({ course_id: courseId, exam_date: new Date(examDate).toISOString(), hours_per_day: hoursPerDay, mode });
      setSchedule(result.schedule);
      setScheduleInfo({
        total_days: result.total_days,
        total_hours: result.total_hours,
        study_hours: (result as any).study_hours,
        review_hours: (result as any).review_hours,
        topics_covered: result.topics_covered,
        mode_summary: (result as any).mode_summary,
      });
      setExpandedDay(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally { setGenerating(false); }
  };

  const exportSchedule = () => {
    if (!schedule.length) return;
    const lines = [`Study Schedule - ${mode.toUpperCase()} MODE`, '='.repeat(50), ''];
    schedule.forEach(day => {
      lines.push(`Day ${day.day_number} - ${day.date} [${day.hours_allocated}h]`);
      if (day.day_theme) lines.push(`Theme: ${day.day_theme}`);
      lines.push('Topics: ' + day.topics.join(', '));
      if (day.mode_tips) lines.push(`Tip: ${day.mode_tips}`);
      if (day.session_strategy) lines.push(`Strategy: ${day.session_strategy}`);
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'study-schedule.txt'; a.click();
  };

  const modeColor = mode === 'panic' ? 'var(--accent-danger)' : mode === 'efficiency' ? 'var(--accent-warning)' : 'var(--accent-primary)';
  const modeColorBg = mode === 'panic' ? 'hsla(0,60%,55%,0.1)' : mode === 'efficiency' ? 'hsla(40,80%,60%,0.1)' : 'hsla(200,80%,60%,0.1)';

  const priorityColor = (p: string) => p === 'high' ? 'var(--accent-danger)' : p === 'medium' ? 'var(--accent-warning)' : 'var(--accent-primary)';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md) var(--space-2xl)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.25rem' }}>←</button>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 600 }}>📅 Cram Countdown Planner</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
          <CourseSelector />
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            {(['deep_dive', 'efficiency', 'panic'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', fontWeight: 600, borderRadius: 'var(--radius-md)', border: `1px solid ${mode === m ? modeColor : 'var(--border-subtle)'}`, background: mode === m ? modeColorBg : 'transparent', color: mode === m ? modeColor : 'var(--text-tertiary)', cursor: 'pointer', transition: 'all 0.2s' }}>
              {m === 'deep_dive' ? '🔬 Deep Dive' : m === 'efficiency' ? '⚡ 80/20' : '🚨 Panic'}
            </button>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '960px', margin: '0 auto', padding: 'var(--space-2xl)' }}>
        {/* Mode Explanation Banner */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)', padding: 'var(--space-lg)', background: modeColorBg, border: `1px solid ${modeColor}`, borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-2xl)' }}>
          <span style={{ fontSize: '2rem' }}>{config.icon}</span>
          <div>
            <div style={{ fontWeight: 700, color: modeColor, marginBottom: '4px' }}>{config.label} Schedule</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{config.description}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              {mode === 'panic' ? '• Only the top 80% high-yield topics included • Short Pomodoro sessions recommended' :
               mode === 'efficiency' ? '• Topics covering 90% of historical marks included • 45-min focused study blocks' :
               '• All topics included with full coverage • 90-min deep work sessions'}
            </div>
          </div>
        </div>

        {/* Input Section */}
        <div className="glass-card" style={{ padding: 'var(--space-xl)', marginBottom: 'var(--space-2xl)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>📅 Exam Date</label>
              <input className="input-field" type="date" value={examDate} onChange={e => setExamDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>⏰ Hours per Day: {hoursPerDay}h</label>
              <input type="range" min={1} max={12} step={0.5} value={hoursPerDay} onChange={e => setHoursPerDay(parseFloat(e.target.value))} style={{ width: '100%', accentColor: modeColor }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}><span>1h</span><span>6h</span><span>12h</span></div>
            </div>
          </div>

          {daysUntilExam !== null && daysUntilExam > 0 && (
            <div style={{ textAlign: 'center', padding: 'var(--space-lg)', background: daysUntilExam <= 3 ? 'hsla(0,60%,55%,0.1)' : daysUntilExam <= 7 ? 'hsla(40,80%,60%,0.1)' : 'hsla(200,80%,60%,0.1)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-lg)' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: daysUntilExam <= 3 ? 'var(--accent-danger)' : daysUntilExam <= 7 ? 'var(--accent-warning)' : 'var(--accent-primary)' }}>{daysUntilExam}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>days until exam • {(daysUntilExam * hoursPerDay).toFixed(0)} total study hours available</div>
            </div>
          )}

          {error && <div style={{ padding: 'var(--space-md)', background: 'hsla(0,60%,55%,0.1)', border: '1px solid var(--accent-danger)', borderRadius: 'var(--radius-md)', color: 'var(--accent-danger)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>{error}</div>}

          <button className="btn-primary" onClick={handleGenerate} disabled={!examDate || generating || !courseId} style={{ width: '100%', padding: 'var(--space-md)', fontSize: '1rem', background: modeColor, borderColor: modeColor }}>
            {generating ? '⏳ Generating Schedule...' : `${config.icon} Generate ${config.label} Schedule`}
          </button>
        </div>

        {/* Generated Schedule */}
        {schedule.length > 0 && (
          <div>
            {/* Stats Row */}
            {scheduleInfo && (
              <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)', flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="badge badge-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>📅 {scheduleInfo.total_days} days</div>
                <div className="badge badge-success" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>⏰ {scheduleInfo.total_hours}h total</div>
                <div className="badge badge-warning" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>📚 {scheduleInfo.topics_covered} topics</div>
                {scheduleInfo.review_hours > 0 && <div className="badge badge-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>🔄 {scheduleInfo.review_hours}h review</div>}
                {scheduleInfo.mode_summary && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 'auto', fontStyle: 'italic' }}>
                    {scheduleInfo.mode_summary.session_strategy}
                  </div>
                )}
                <button onClick={exportSchedule} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', marginLeft: 'auto' }}>📋 Export</button>
              </div>
            )}

            <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
              {schedule.map((day, i) => {
                const isExpanded = expandedDay === i;
                const dayBorderColor = day.is_review ? 'var(--accent-secondary)' : priorityColor(day.priority);

                return (
                  <div key={i} className="glass-card animate-slide-in" style={{ padding: 0, animationDelay: `${i * 40}ms`, borderLeft: `4px solid ${dayBorderColor}`, overflow: 'hidden' }}>
                    {/* Day Header */}
                    <button onClick={() => setExpandedDay(isExpanded ? null : i)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-lg)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 'var(--space-md)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flex: 1 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: '2px' }}>
                            <span style={{ fontWeight: 700 }}>Day {day.day_number}</span>
                            {day.day_theme && <span style={{ fontSize: '0.78rem', color: dayBorderColor, fontWeight: 600 }}>{day.day_theme}</span>}
                          </div>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{day.date}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', flex: 1 }}>
                          {day.topics.slice(0, 3).map((topic, j) => (
                            <span key={j} style={{ padding: '0.2rem 0.6rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: 'var(--text-primary)' }}>{topic}</span>
                          ))}
                          {day.topics.length > 3 && <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', alignSelf: 'center' }}>+{day.topics.length - 3} more</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexShrink: 0 }}>
                        <span className={`badge ${day.is_review ? 'badge-primary' : day.priority === 'high' ? 'badge-danger' : 'badge-warning'}`}>{day.hours_allocated}h</span>
                        <span style={{ color: 'var(--text-tertiary)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                      </div>
                    </button>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div style={{ padding: 'var(--space-lg)', paddingTop: 0, borderTop: '1px solid var(--border-subtle)' }}>
                        {/* Mode Tip */}
                        {day.mode_tips && (
                          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-start', padding: 'var(--space-sm) var(--space-md)', background: modeColorBg, borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>
                            <span style={{ color: modeColor, flexShrink: 0 }}>💡</span>
                            <div>
                              <div style={{ fontWeight: 600, color: modeColor, marginBottom: '2px' }}>Study Tip</div>
                              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{day.mode_tips}</div>
                            </div>
                          </div>
                        )}
                        {/* Session Strategy */}
                        {day.session_strategy && (
                          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-start', padding: 'var(--space-sm) var(--space-md)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>
                            <span style={{ flexShrink: 0 }}>⏱️</span>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px' }}>Session Strategy</div>
                              <div style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>{day.session_strategy}</div>
                            </div>
                          </div>
                        )}
                        {/* Per-Topic Breakdown */}
                        {day.details && day.details.length > 0 && (
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>Topic Breakdown</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                              {day.details.filter((d: any) => d.name !== '📖 Review & Practice').map((d: any, j: number) => (
                                <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-sm) var(--space-md)', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                                  <span style={{ flex: 1, fontWeight: 500 }}>{d.name}</span>
                                  <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                                    {d.weightage_percent > 0 && <span className={`badge ${d.priority === 'high' ? 'badge-danger' : d.priority === 'medium' ? 'badge-warning' : 'badge-primary'}`} style={{ fontSize: '0.7rem' }}>{d.weightage_percent}%</span>}
                                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.82rem' }}>{d.hours}h</span>
                                    <span title={d.trend}>{d.trend === 'increasing' ? '📈' : d.trend === 'decreasing' ? '📉' : '➡️'}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
