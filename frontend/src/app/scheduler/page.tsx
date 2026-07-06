/**
 * Scheduler Page — Cram Countdown Planner
 * ==========================================
 * Interactive study schedule generator based on exam date,
 * available hours, and topic importance.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useStudyMode } from '@/hooks/useStudyMode';
import { generateSchedule } from '@/lib/api';
import type { ScheduleDay } from '@/types';

export default function SchedulerPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { mode } = useStudyMode();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course');

  const [examDate, setExamDate] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState(4);
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [scheduleInfo, setScheduleInfo] = useState<{ total_days: number; total_hours: number; topics_covered: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/');
  }, [authLoading, isAuthenticated, router]);

  const handleGenerate = async () => {
    if (!courseId || !examDate) {
      setError('Please select an exam date');
      return;
    }

    setGenerating(true);
    setError('');

    try {
      const result = await generateSchedule({
        course_id: courseId,
        exam_date: new Date(examDate).toISOString(),
        hours_per_day: hoursPerDay,
        mode,
      });

      setSchedule(result.schedule);
      setScheduleInfo({
        total_days: result.total_days,
        total_hours: result.total_hours,
        topics_covered: result.topics_covered,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally {
      setGenerating(false);
    }
  };

  // Calculate days until exam in a pure useEffect to avoid render-time impurity
  const [daysUntilExam, setDaysUntilExam] = useState<number | null>(null);

  useEffect(() => {
    if (examDate) {
      const diffTime = new Date(examDate).getTime() - Date.now();
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      Promise.resolve().then(() => {
        setDaysUntilExam(days);
      });
    } else {
      Promise.resolve().then(() => {
        setDaysUntilExam(null);
      });
    }
  }, [examDate]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md) var(--space-2xl)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.25rem' }}>←</button>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 600 }}>📅 Cram Countdown Planner</h1>
      </header>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: 'var(--space-2xl)' }}>
        {/* Input Section */}
        <div className="glass-card" style={{ padding: 'var(--space-xl)', marginBottom: 'var(--space-2xl)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                📅 Exam Date
              </label>
              <input
                className="input-field"
                type="date"
                value={examDate}
                onChange={e => setExamDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                ⏰ Hours per Day: {hoursPerDay}h
              </label>
              <input
                type="range"
                min={1}
                max={12}
                step={0.5}
                value={hoursPerDay}
                onChange={e => setHoursPerDay(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                <span>1h</span><span>6h</span><span>12h</span>
              </div>
            </div>
          </div>

          {/* Countdown */}
          {daysUntilExam !== null && daysUntilExam > 0 && (
            <div style={{
              textAlign: 'center',
              padding: 'var(--space-lg)',
              background: daysUntilExam <= 3 ? 'hsla(0, 60%, 55%, 0.1)' : daysUntilExam <= 7 ? 'hsla(40, 80%, 60%, 0.1)' : 'hsla(200, 80%, 60%, 0.1)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: 'var(--space-lg)',
            }}>
              <div style={{
                fontSize: '3rem',
                fontWeight: 800,
                color: daysUntilExam <= 3 ? 'var(--accent-danger)' : daysUntilExam <= 7 ? 'var(--accent-warning)' : 'var(--accent-primary)',
              }}>
                {daysUntilExam}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                days until exam • {(daysUntilExam * hoursPerDay).toFixed(0)} total study hours available
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: 'var(--space-md)', background: 'hsla(0, 60%, 55%, 0.1)', border: '1px solid var(--accent-danger)', borderRadius: 'var(--radius-md)', color: 'var(--accent-danger)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <button className="btn-primary" onClick={handleGenerate} disabled={!examDate || generating || !courseId} style={{ width: '100%', padding: 'var(--space-md)', fontSize: '1rem' }}>
            {generating ? '⏳ Generating Schedule...' : '📅 Generate Study Schedule'}
          </button>
        </div>

        {/* Generated Schedule */}
        {schedule.length > 0 && (
          <div>
            {scheduleInfo && (
              <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)', flexWrap: 'wrap' }}>
                <div className="badge badge-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
                  📅 {scheduleInfo.total_days} days
                </div>
                <div className="badge badge-success" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
                  ⏰ {scheduleInfo.total_hours}h total
                </div>
                <div className="badge badge-warning" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
                  📚 {scheduleInfo.topics_covered} topics
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
              {schedule.map((day, i) => (
                <div
                  key={i}
                  className="glass-card animate-slide-in"
                  style={{
                    padding: 'var(--space-lg)',
                    animationDelay: `${i * 50}ms`,
                    borderLeft: `3px solid ${
                      day.is_review ? 'var(--accent-secondary)' :
                      day.priority === 'high' ? 'var(--accent-danger)' :
                      day.priority === 'medium' ? 'var(--accent-warning)' : 'var(--accent-primary)'
                    }`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>Day {day.day_number}</span>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: 'var(--space-sm)', fontSize: '0.85rem' }}>{day.date}</span>
                    </div>
                    <span className={`badge ${day.is_review ? 'badge-primary' : day.priority === 'high' ? 'badge-danger' : 'badge-warning'}`}>
                      {day.hours_allocated}h
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                    {day.topics.map((topic, j) => (
                      <span key={j} style={{
                        padding: '0.2rem 0.6rem',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.8rem',
                        color: 'var(--text-primary)',
                      }}>
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
