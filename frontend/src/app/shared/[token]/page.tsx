/**
 * Shared Profile Page
 * =====================
 * Public page that loads a shared course profile via crypto token.
 * No authentication required — anyone with the link can view.
 */

'use client';

import { useState, useEffect, use, useCallback } from 'react';
import Link from 'next/link';
import { getSharedProfile } from '@/lib/api';
import type { TopicFrequency } from '@/types';

export default function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<{
    course: { name: string; code?: string; university?: string };
    topic_frequencies: TopicFrequency[];
    expires_at?: string;
  } | null>(null);

  const loadSharedProfile = useCallback(async () => {
    try {
      const result = await getSharedProfile(token);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Share link not found or expired');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    Promise.resolve().then(() => {
      loadSharedProfile();
    });
  }, [loadSharedProfile]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div className="animate-subtle-pulse" style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>
          Loading shared profile...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div className="glass-card" style={{ padding: 'var(--space-2xl)', textAlign: 'center', maxWidth: '500px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>🔗</div>
          <h2 style={{ marginBottom: 'var(--space-sm)' }}>Link Not Found</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            {error || 'This share link may have expired or been revoked.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ padding: 'var(--space-md) var(--space-2xl)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <span style={{ fontSize: '1.25rem' }}>🔬</span>
          <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>SyllabusX-Ray</span>
          <span className="badge badge-primary" style={{ marginLeft: 'var(--space-sm)' }}>Shared</span>
        </div>
        <Link href="/" className="btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', textDecoration: 'none' }}>
          Create Your Own →
        </Link>
      </header>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: 'var(--space-2xl)' }}>
        {/* Course Info */}
        <div className="glass-card" style={{ padding: 'var(--space-xl)', marginBottom: 'var(--space-2xl)' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-sm)' }}>
            {data.course?.name || 'Shared Course'}
          </h1>
          <div style={{ display: 'flex', gap: 'var(--space-md)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {data.course?.code && <span className="badge badge-primary">{data.course.code}</span>}
            {data.course?.university && <span>📍 {data.course.university}</span>}
          </div>
        </div>

        {/* Topic Frequencies */}
        {data.topic_frequencies && data.topic_frequencies.length > 0 && (
          <div className="glass-card" style={{ padding: 'var(--space-xl)' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
              📊 Topic Frequency Analysis
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                    <th style={{ textAlign: 'left', padding: 'var(--space-sm) var(--space-md)', color: 'var(--text-secondary)' }}>Topic</th>
                    <th style={{ textAlign: 'center', padding: 'var(--space-sm)', color: 'var(--text-secondary)' }}>Marks</th>
                    <th style={{ textAlign: 'center', padding: 'var(--space-sm)', color: 'var(--text-secondary)' }}>Weightage</th>
                    <th style={{ textAlign: 'center', padding: 'var(--space-sm)', color: 'var(--text-secondary)' }}>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topic_frequencies.map((f, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: 'var(--space-sm) var(--space-md)', fontWeight: 500 }}>{f.topic_name}</td>
                      <td style={{ textAlign: 'center' }}>{f.total_marks}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${f.weightage_percent >= 15 ? 'badge-danger' : f.weightage_percent >= 8 ? 'badge-warning' : 'badge-primary'}`}>
                          {f.weightage_percent}%
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {f.trend === 'increasing' ? '📈' : f.trend === 'decreasing' ? '📉' : '➡️'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
