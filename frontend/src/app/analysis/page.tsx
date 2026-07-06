/**
 * Analysis Page — Data Visualization Dashboard
 * ================================================
 * Displays topic frequency, weightage, and 80/20 analysis
 * using Recharts bar/pie charts and a searchable study guide.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useStudyMode } from '@/hooks/useStudyMode';
import { useAnalysis } from '@/hooks/useAnalysis';
import { searchCourseMaterials } from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
} from 'recharts';

const CHART_COLORS = [
  'hsl(200, 80%, 60%)', 'hsl(260, 60%, 65%)', 'hsl(160, 60%, 50%)',
  'hsl(40, 80%, 60%)', 'hsl(0, 60%, 55%)', 'hsl(180, 60%, 50%)',
  'hsl(300, 50%, 60%)', 'hsl(30, 80%, 55%)', 'hsl(120, 50%, 50%)',
  'hsl(220, 70%, 60%)',
];

export default function AnalysisPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { mode } = useStudyMode();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course');

  const { frequencies, highYield, loading, error } = useAnalysis(courseId);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<string>('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/');
  }, [authLoading, isAuthenticated, router]);

  const barChartData = useMemo(() => {
    return frequencies.slice(0, 10).map(f => ({
      name: f.topic_name.length > 20 ? f.topic_name.slice(0, 18) + '...' : f.topic_name,
      marks: f.total_marks,
      frequency: f.times_appeared,
      weightage: f.weightage_percent,
    }));
  }, [frequencies]);

  const pieChartData = useMemo(() => {
    return frequencies.slice(0, 8).map(f => ({
      name: f.topic_name.length > 15 ? f.topic_name.slice(0, 13) + '...' : f.topic_name,
      value: f.weightage_percent,
    }));
  }, [frequencies]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !courseId) return;
    setSearching(true);
    try {
      const result = await searchCourseMaterials({
        course_id: courseId,
        query: searchQuery,
        mode,
      });
      setSearchResult(result.answer);
    } catch {
      setSearchResult('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  if (!courseId) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div className="glass-card" style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>
          <h2>No course selected</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>
            Go to the dashboard and select a course first.
          </p>
          <button className="btn-primary" onClick={() => router.push('/dashboard')}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md) var(--space-2xl)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.25rem' }}>←</button>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 600 }}>📊 Analysis Dashboard</h1>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: 'var(--space-2xl)' }}>
        {loading ? (
          <div className="animate-subtle-pulse" style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--text-secondary)' }}>
            Loading analysis data...
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--accent-danger)' }}>
            {error}
          </div>
        ) : (
          <>
            {/* 80/20 Summary Card */}
            {highYield && (
              <div className="glass-card animate-slide-in" style={{ padding: 'var(--space-xl)', marginBottom: 'var(--space-2xl)', borderLeft: '4px solid var(--accent-warning)' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--accent-warning)', marginBottom: 'var(--space-sm)' }}>
                  ⚡ 80/20 Pareto Insight
                </h2>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-sm)' }}>
                  {highYield.efficiency_ratio}
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Focus on these {highYield.high_yield_count} topics to cover {highYield.threshold_percent}% of historical marks.
                </p>
              </div>
            )}

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--space-xl)', marginBottom: 'var(--space-2xl)' }}>
              {/* Bar Chart: Mark Distribution */}
              <div className="glass-card animate-slide-in delay-100" style={{ padding: 'var(--space-xl)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
                  📊 Mark Distribution by Topic
                </h3>
                {barChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} angle={-30} textAnchor="end" height={80} />
                      <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                      <Bar dataKey="marks" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 'var(--space-2xl)' }}>
                    Upload PYQ papers to see mark distribution
                  </p>
                )}
              </div>

              {/* Pie Chart: Weightage */}
              <div className="glass-card animate-slide-in delay-200" style={{ padding: 'var(--space-xl)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
                  🎯 Topic Weightage
                </h3>
                {pieChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={pieChartData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}%`} labelLine={true}>
                        {pieChartData.map((_, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                      <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 'var(--space-2xl)' }}>
                    No weightage data available yet
                  </p>
                )}
              </div>
            </div>

            {/* Topic Frequency Table */}
            <div className="glass-card animate-slide-in delay-300" style={{ padding: 'var(--space-xl)', marginBottom: 'var(--space-2xl)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
                📋 Topic Frequency Table
              </h3>
              {frequencies.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                        <th style={{ textAlign: 'left', padding: 'var(--space-sm) var(--space-md)', color: 'var(--text-secondary)' }}>Topic</th>
                        <th style={{ textAlign: 'center', padding: 'var(--space-sm)', color: 'var(--text-secondary)' }}>Marks</th>
                        <th style={{ textAlign: 'center', padding: 'var(--space-sm)', color: 'var(--text-secondary)' }}>Appearances</th>
                        <th style={{ textAlign: 'center', padding: 'var(--space-sm)', color: 'var(--text-secondary)' }}>Weightage</th>
                        <th style={{ textAlign: 'center', padding: 'var(--space-sm)', color: 'var(--text-secondary)' }}>Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {frequencies.map((f, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: 'var(--space-sm) var(--space-md)', fontWeight: 500 }}>{f.topic_name}</td>
                          <td style={{ textAlign: 'center', padding: 'var(--space-sm)' }}>{f.total_marks}</td>
                          <td style={{ textAlign: 'center', padding: 'var(--space-sm)' }}>{f.times_appeared}×</td>
                          <td style={{ textAlign: 'center', padding: 'var(--space-sm)' }}>
                            <span className={`badge ${f.weightage_percent >= 15 ? 'badge-danger' : f.weightage_percent >= 8 ? 'badge-warning' : 'badge-primary'}`}>
                              {f.weightage_percent}%
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', padding: 'var(--space-sm)' }}>
                            {f.trend === 'increasing' ? '📈' : f.trend === 'decreasing' ? '📉' : '➡️'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 'var(--space-xl)' }}>
                  No data yet. Upload exam papers to see analysis.
                </p>
              )}
            </div>

            {/* Search / Ask */}
            <div className="glass-card animate-slide-in delay-400" style={{ padding: 'var(--space-xl)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)' }}>
                🔍 Ask About Your Materials
              </h3>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <input
                  className="input-field"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="e.g., Explain quicksort time complexity..."
                  disabled={searching}
                />
                <button className="btn-primary" onClick={handleSearch} disabled={searching || !searchQuery.trim()} style={{ whiteSpace: 'nowrap' }}>
                  {searching ? '⏳' : '🔍 Search'}
                </button>
              </div>
              {searchResult && (
                <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-lg)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {searchResult}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
