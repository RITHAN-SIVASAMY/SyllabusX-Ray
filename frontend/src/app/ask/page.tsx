/**
 * Ask AI Page — Document Query Interface
 * ========================================
 * Full RAG-powered query page with mode-specific structured responses,
 * source citations, confidence visualization, and query history.
 */

'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useStudyMode } from '@/hooks/useStudyMode';
import { searchCourseMaterials, listCourses } from '@/lib/api';
import type { SearchResponse, SourceChunk } from '@/types';
import CourseSelector from '@/components/CourseSelector';
import MarkdownRenderer from '@/components/MarkdownRenderer';

const HISTORY_KEY = 'syllabusx-query-history';
const MAX_HISTORY = 8;

interface QueryHistory {
  id: string;
  query: string;
  mode: string;
  timestamp: number;
}

function AskPageContent() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { mode, config, setMode } = useStudyMode();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course');
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [expandedSources, setExpandedSources] = useState(false);
  const [history, setHistory] = useState<QueryHistory[]>([]);
  const [courseName, setCourseName] = useState('');
  const [isDetailed, setIsDetailed] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (courseId) {
      listCourses().then(courses => {
        const c = courses.find(c => c.id === courseId);
        if (c) setCourseName(c.name);
      }).catch(() => {});
    }
  }, [courseId]);

  const addToHistory = (q: string, m: string) => {
    const entry: QueryHistory = {
      id: Date.now().toString(),
      query: q,
      mode: m,
      timestamp: Date.now(),
    };
    const updated = [entry, ...history.filter(h => h.query !== q)].slice(0, MAX_HISTORY);
    setHistory(updated);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
  };

  const handleSearch = async (queryText?: string) => {
    const q = (queryText ?? query).trim();
    if (!q || !courseId) {
      setError(!courseId ? 'No course selected. Go back to dashboard and pick a course.' : 'Please enter a question.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await searchCourseMaterials({ course_id: courseId, query: q, mode, detailed: isDetailed });
      setResult(res);
      addToHistory(q, mode);
      if (queryText) setQuery(queryText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const modeColor = mode === 'panic' ? 'var(--accent-danger)' : mode === 'efficiency' ? 'var(--accent-warning)' : 'var(--accent-primary)';
  const modeColorHsl = mode === 'panic' ? 'hsla(0, 60%, 55%, 0.1)' : mode === 'efficiency' ? 'hsla(40, 80%, 60%, 0.1)' : 'hsla(200, 80%, 60%, 0.1)';

  const confidenceColor = (score: number) =>
    score >= 0.7 ? 'var(--accent-success)' : score >= 0.4 ? 'var(--accent-warning)' : 'var(--accent-danger)';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md) var(--space-2xl)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.25rem' }}>←</button>
        <div>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 600 }}>🤖 Ask AI</h1>
        </div>
        {/* Mode indicator */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
          <CourseSelector />
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          {(['deep_dive', 'efficiency', 'panic'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '0.3rem 0.7rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${mode === m ? modeColor : 'var(--border-subtle)'}`,
                background: mode === m ? modeColorHsl : 'transparent',
                color: mode === m ? modeColor : 'var(--text-tertiary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {m === 'deep_dive' ? '🔬' : m === 'efficiency' ? '⚡' : '🚨'}{' '}
              {m === 'deep_dive' ? 'Deep Dive' : m === 'efficiency' ? '80/20' : 'Panic'}
            </button>
          ))}
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 'calc(100vh - 61px)', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Sidebar — Query History */}
        <aside style={{ borderRight: '1px solid var(--border-subtle)', padding: 'var(--space-xl) var(--space-md)', background: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 'var(--space-md)' }}>
            Recent Queries
          </div>
          {history.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', fontStyle: 'italic' }}>
              Your questions will appear here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {history.map(h => (
                <button
                  key={h.id}
                  onClick={() => handleSearch(h.query)}
                  style={{
                    textAlign: 'left',
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-sm)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    color: 'var(--text-primary)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 500, lineHeight: 1.3, marginBottom: '2px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {h.query}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
                    {h.mode === 'panic' ? '🚨' : h.mode === 'efficiency' ? '⚡' : '🔬'} {new Date(h.timestamp).toLocaleDateString()}
                  </div>
                </button>
              ))}
              <button
                onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); }}
                style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 'var(--space-sm)', textAlign: 'left' }}
              >
                Clear history
              </button>
            </div>
          )}

          {/* Suggested Questions */}
          <div style={{ marginTop: 'var(--space-xl)', fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 'var(--space-md)' }}>
            Try asking
          </div>
          {[
            'What are the most important topics for the exam?',
            'Explain the key formulas I need to know',
            'What question patterns appear most often?',
            'Summarize Module 1 key concepts',
          ].map((suggestion, i) => (
            <button
              key={i}
              onClick={() => { setQuery(suggestion); inputRef.current?.focus(); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: 'var(--space-xs) 0',
                cursor: 'pointer',
                color: 'var(--accent-primary)',
                fontSize: '0.78rem',
                lineHeight: 1.4,
                marginBottom: 'var(--space-xs)',
              }}
            >
              → {suggestion}
            </button>
          ))}
        </aside>

        {/* Main Content */}
        <main style={{ padding: 'var(--space-2xl)', overflowY: 'auto' }}>
          {/* Mode Banner */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
            padding: 'var(--space-sm) var(--space-md)',
            background: modeColorHsl,
            border: `1px solid ${modeColor}`,
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-xl)',
            fontSize: '0.82rem',
          }}>
            <span style={{ color: modeColor, fontWeight: 700 }}>{config.label} Mode</span>
            <span style={{ color: 'var(--text-secondary)' }}>—</span>
            <span style={{ color: 'var(--text-secondary)' }}>{config.description}</span>
          </div>

          {/* Search Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', marginBottom: 'var(--space-xl)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <input
                ref={inputRef}
                className="input-field"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && handleSearch()}
                placeholder="Ask anything about your course materials..."
                disabled={loading}
                style={{ flexGrow: 1, fontSize: '1rem', padding: 'var(--space-md)' }}
              />
              <button
                className="btn-primary"
                onClick={() => handleSearch()}
                disabled={loading || !query.trim() || !courseId}
                style={{ whiteSpace: 'nowrap', padding: 'var(--space-md) var(--space-xl)', fontSize: '0.95rem' }}
              >
                {loading ? '⏳ Searching...' : '🔍 Ask'}
              </button>
            </div>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer', alignSelf: 'flex-start', paddingLeft: '4px' }}>
              <input 
                type="checkbox" 
                checked={isDetailed} 
                onChange={(e) => setIsDetailed(e.target.checked)}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              Enable detailed, comprehensive explanations for all sections
            </label>
          </div>

          {error && (
            <div style={{ padding: 'var(--space-md)', background: 'hsla(0, 60%, 55%, 0.1)', border: '1px solid var(--accent-danger)', borderRadius: 'var(--radius-md)', color: 'var(--accent-danger)', marginBottom: 'var(--space-lg)', fontSize: '0.875rem' }}>
              ⚠️ {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="glass-card animate-subtle-pulse" style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-md)' }}>🤔</div>
              <div style={{ color: 'var(--text-secondary)' }}>Searching your course materials and generating a response...</div>
            </div>
          )}

          {/* Result */}
          {result && !loading && (
            <div className="animate-slide-in">
              {/* Confidence Score */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confidence</span>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {[0.2, 0.4, 0.6, 0.8, 1.0].map(threshold => (
                      <div
                        key={threshold}
                        style={{
                          width: '20px',
                          height: '6px',
                          borderRadius: '3px',
                          background: result.confidence_score >= threshold
                            ? confidenceColor(result.confidence_score)
                            : 'var(--border-subtle)',
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: confidenceColor(result.confidence_score) }}>
                    {Math.round(result.confidence_score * 100)}%
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  {result.source_chunks.length} source{result.source_chunks.length !== 1 ? 's' : ''} found
                </span>
              </div>

              {/* Main Answer */}
              <div className="glass-card" style={{ padding: 'var(--space-xl)', marginBottom: 'var(--space-lg)', borderLeft: `4px solid ${modeColor}` }}>
                <div style={{ fontSize: '0.72rem', color: modeColor, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 'var(--space-md)' }}>
                  {config.label} Answer
                </div>
                <div style={{ fontSize: '0.95rem', lineHeight: 1.8, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                  <MarkdownRenderer content={result.answer} />
                </div>
              </div>

              {/* Mode-specific extras */}
              {result.llm_extras && (
                <>
                  {/* DEEP DIVE extras */}
                  {mode === 'deep_dive' && (
                    <div style={{ display: 'grid', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                      {result.llm_extras.key_concepts && result.llm_extras.key_concepts.length > 0 && (
                        <div className="glass-card" style={{ padding: 'var(--space-lg)' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            🔑 Key Concepts
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                            {result.llm_extras.key_concepts.map((c, i) => (
                              <span key={i} style={{ padding: '0.3rem 0.75rem', background: 'hsla(200, 80%, 60%, 0.12)', border: '1px solid hsla(200, 80%, 60%, 0.3)', borderRadius: 'var(--radius-full)', fontSize: '0.82rem', color: 'var(--accent-primary)' }}>
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.llm_extras.formulas && result.llm_extras.formulas.length > 0 && (
                        <div className="glass-card" style={{ padding: 'var(--space-lg)' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-secondary)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            📐 Formulas & Definitions
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                            {result.llm_extras.formulas.map((f, i) => (
                              <code key={i} style={{ display: 'block', padding: 'var(--space-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                                {f}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.llm_extras.exam_tips && result.llm_extras.exam_tips.length > 0 && (
                        <div className="glass-card" style={{ padding: 'var(--space-lg)' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-warning)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            💡 Exam Tips
                          </div>
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                            {result.llm_extras.exam_tips.map((t, i) => (
                              <li key={i} style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* EFFICIENCY extras */}
                  {mode === 'efficiency' && (
                    <div style={{ display: 'grid', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                      {result.llm_extras.must_know && result.llm_extras.must_know.length > 0 && (
                        <div className="glass-card" style={{ padding: 'var(--space-lg)', borderLeft: '3px solid var(--accent-warning)' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-warning)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            ⚡ Must Know
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                            {result.llm_extras.must_know.map((m, i) => (
                              <div key={i} style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-start', fontSize: '0.88rem', lineHeight: 1.6 }}>
                                <span style={{ color: 'var(--accent-warning)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                                <span style={{ color: 'var(--text-primary)' }}>{m}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.llm_extras.key_formulas && result.llm_extras.key_formulas.length > 0 && (
                        <div className="glass-card" style={{ padding: 'var(--space-lg)' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-secondary)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            📐 Key Formulas
                          </div>
                          {result.llm_extras.key_formulas.map((f, i) => (
                            <code key={i} style={{ display: 'block', padding: 'var(--space-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', fontFamily: 'monospace', marginBottom: 'var(--space-xs)', color: 'var(--text-primary)' }}>
                              {f}
                            </code>
                          ))}
                        </div>
                      )}
                      {result.llm_extras.likely_questions && result.llm_extras.likely_questions.length > 0 && (
                        <div className="glass-card" style={{ padding: 'var(--space-lg)', borderLeft: '3px solid var(--accent-primary)' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            🎯 Likely Exam Questions
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                            {result.llm_extras.likely_questions.map((q, i) => (
                              <div key={i} style={{ padding: 'var(--space-sm)', background: 'hsla(200, 80%, 60%, 0.05)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                <span style={{ color: 'var(--accent-primary)', fontWeight: 700, marginRight: '0.4rem' }}>Q{i + 1}.</span>
                                {q}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PANIC extras */}
                  {mode === 'panic' && (
                    <div style={{ display: 'grid', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                      {result.llm_extras.essential_definitions && result.llm_extras.essential_definitions.length > 0 && (
                        <div className="glass-card" style={{ padding: 'var(--space-lg)', borderLeft: '3px solid var(--accent-danger)' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-danger)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            🚨 Essential Definitions
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                                <th style={{ textAlign: 'left', padding: 'var(--space-xs) var(--space-sm)', color: 'var(--text-secondary)', fontWeight: 600, width: '35%' }}>Term</th>
                                <th style={{ textAlign: 'left', padding: 'var(--space-xs) var(--space-sm)', color: 'var(--text-secondary)', fontWeight: 600 }}>Definition</th>
                              </tr>
                            </thead>
                            <tbody>
                              {result.llm_extras.essential_definitions.map((d, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                  <td style={{ padding: 'var(--space-sm)', fontWeight: 600, color: 'var(--accent-danger)', verticalAlign: 'top' }}>{d.term}</td>
                                  <td style={{ padding: 'var(--space-sm)', color: 'var(--text-primary)', lineHeight: 1.5 }}>{d.definition}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {result.llm_extras.essential_formulas && result.llm_extras.essential_formulas.length > 0 && (
                        <div className="glass-card" style={{ padding: 'var(--space-lg)' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-warning)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            📐 Must-Know Formulas
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-sm)' }}>
                            {result.llm_extras.essential_formulas.map((f, i) => (
                              <code key={i} style={{ display: 'block', padding: 'var(--space-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontFamily: 'monospace', textAlign: 'center', color: 'var(--text-primary)' }}>
                                {f}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.llm_extras.quick_tips && result.llm_extras.quick_tips.length > 0 && (
                        <div className="glass-card" style={{ padding: 'var(--space-lg)', background: 'hsla(0, 60%, 55%, 0.05)' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-danger)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            ⚡ Quick Tips
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                            {result.llm_extras.quick_tips.map((t, i) => (
                              <div key={i} style={{ display: 'flex', gap: 'var(--space-sm)', fontSize: '0.88rem', lineHeight: 1.5 }}>
                                <span style={{ color: 'var(--accent-danger)', flexShrink: 0 }}>→</span>
                                <span style={{ color: 'var(--text-primary)' }}>{t}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Source Citations */}
              {result.source_chunks.length > 0 && (
                <div className="glass-card" style={{ padding: 'var(--space-lg)' }}>
                  <button
                    onClick={() => setExpandedSources(!expandedSources)}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, width: '100%', textAlign: 'left' }}
                  >
                    <span>📚 Source Citations ({result.source_chunks.length})</span>
                    <span style={{ marginLeft: 'auto', transform: expandedSources ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                  </button>

                  {expandedSources && (
                    <div style={{ marginTop: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                      {result.source_chunks.map((chunk: SourceChunk, i) => (
                        <div
                          key={i}
                          style={{
                            padding: 'var(--space-md)',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 'var(--radius-md)',
                            borderLeft: `3px solid ${chunk.metadata?.source_type === 'pyq' ? 'var(--accent-warning)' : 'var(--accent-primary)'}`,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)', flexWrap: 'wrap' }}>
                            <span className={`badge ${chunk.metadata?.source_type === 'pyq' ? 'badge-warning' : 'badge-primary'}`} style={{ fontSize: '0.7rem' }}>
                              {chunk.metadata?.source_type === 'pyq' ? '📝 PYQ' : '📋 Syllabus'}
                            </span>
                            {chunk.metadata?.exam_year && (
                              <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>{chunk.metadata.exam_year}</span>
                            )}
                            {chunk.metadata?.heading && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{chunk.metadata.heading}</span>
                            )}
                            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                              Rank #{chunk.rank + 1} · Score {chunk.rerank_score?.toFixed(3)}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                            {chunk.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!result && !loading && !error && (
            <div style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--text-tertiary)' }}>
              <div style={{ fontSize: '4rem', marginBottom: 'var(--space-lg)' }}>💬</div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                Ask anything about your course
              </h2>
              <p style={{ fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto', lineHeight: 1.7 }}>
                Your uploaded syllabus and past exam papers are searched using hybrid AI to give you mode-specific, structured answers.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function AskPage() {
  return (
    <Suspense fallback={<div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>}>
      <AskPageContent />
    </Suspense>
  );
}
