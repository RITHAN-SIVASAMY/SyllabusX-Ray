/**
 * Dashboard Page — The Tri-State Command Center
 * ================================================
 * The main workspace after login. Features:
 * - Study mode selector (Deep Dive / 80-20 / Panic)
 * - Course cards with upload status
 * - Quick navigation to upload, analysis, scheduler
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useStudyMode } from '@/hooks/useStudyMode';
import { listCourses, getCourseDocuments, deleteDocument, reanalyzeDocument } from '@/lib/api';
import type { StudyMode } from '@/types';
import UserProfile from '@/components/UserProfile';

export default function DashboardPage() {
  const { user, isAuthenticated, loading: authLoading, signOut } = useAuth();
  const { mode, setMode, config } = useStudyMode();
  const router = useRouter();
  const [courses, setCourses] = useState<Array<{ id: string; name: string; code?: string; documents: { count: number }[] }>>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  // Document Manager State
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [courseDocuments, setCourseDocuments] = useState<Array<any>>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);

  const toggleCourseDocuments = async (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedCourseId === courseId) {
      setExpandedCourseId(null);
      return;
    }
    setExpandedCourseId(courseId);
    setDocumentsLoading(true);
    try {
      const docs = await getCourseDocuments(courseId);
      setCourseDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setDocumentsLoading(false);
    }
  };

  const handleDeleteDocument = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this document? All associated analysis will be removed.')) return;
    
    try {
      await deleteDocument(docId);
      setCourseDocuments(prev => prev.filter(d => d.id !== docId));
      loadCourses(); // Refresh counts
    } catch (err) {
      alert('Failed to delete document');
    }
  };

  const handleReanalyzeDocument = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to re-analyze this document? This will update the topic mappings using the latest AI engine.')) return;
    
    try {
      await reanalyzeDocument(docId);
      // Update local state to show it is processing
      setCourseDocuments(prev => prev.map(d => d.id === docId ? { ...d, processing_status: 'processing' } : d));
      alert('Re-analysis started! This will take a few seconds in the background.');
    } catch (err) {
      alert('Failed to start re-analysis.');
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [authLoading, isAuthenticated, router]);

  const loadCourses = useCallback(async () => {
    try {
      const data = await listCourses();
      setCourses(data);
    } catch (err) {
      console.error('Failed to load courses:', err);
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      Promise.resolve().then(() => {
        loadCourses();
      });
    }
  }, [isAuthenticated, loadCourses]);

  // Polling logic: if any document in the currently expanded course is 'processing', reload them every 3 seconds
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (expandedCourseId) {
      const hasProcessingDocs = courseDocuments.some(doc => doc.processing_status === 'processing');
      if (hasProcessingDocs) {
        intervalId = setInterval(async () => {
          try {
            const docs = await getCourseDocuments(expandedCourseId);
            setCourseDocuments(docs);
            
            // If none are processing anymore, the effect will re-run and clear the interval
          } catch (err) {
            console.error('Failed to poll documents:', err);
          }
        }, 3000);
      }
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [expandedCourseId, courseDocuments]);

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="animate-subtle-pulse" style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          Loading...
        </div>
      </div>
    );
  }

  const modes: { key: StudyMode; icon: string; label: string }[] = [
    { key: 'deep_dive', icon: '🔬', label: 'Deep Dive' },
    { key: 'efficiency', icon: '⚡', label: '80/20 Efficiency' },
    { key: 'panic', icon: '🚨', label: 'Panic Mode' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Top Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-md) var(--space-2xl)',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <span style={{ fontSize: '1.25rem' }}>🔬</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
            SyllabusX-Ray
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <UserProfile />
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: 'var(--space-2xl)' }}>
        {/* Mode Selector */}
        <section style={{ marginBottom: 'var(--space-2xl)' }}>
          <h2 style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
            Study Mode
          </h2>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            {modes.map((m) => (
              <button
                key={m.key}
                className={`mode-btn ${mode === m.key ? 'active' : ''}`}
                onClick={() => setMode(m.key)}
                style={{
                  borderColor: mode === m.key
                    ? m.key === 'deep_dive' ? 'var(--accent-primary)'
                    : m.key === 'efficiency' ? 'var(--accent-warning)'
                    : 'var(--accent-danger)'
                    : undefined,
                }}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 'var(--space-sm)' }}>
            {config.icon} {config.description}
          </p>
        </section>

        {/* Quick Actions */}
        <section style={{ marginBottom: 'var(--space-2xl)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)' }}>
            <button
              className="glass-card card-hover"
              onClick={() => router.push('/upload')}
              style={{
                padding: 'var(--space-xl)',
                textAlign: 'left',
                border: 'none',
                cursor: 'pointer',
                background: 'var(--glass-bg)',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-sm)' }}>📄</div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Upload Documents</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Add syllabus or PYQ papers
              </div>
            </button>

            <button
              className="glass-card card-hover"
              onClick={() => courses.length > 0 && router.push(`/analysis?course=${courses[0]?.id}`)}
              style={{
                padding: 'var(--space-xl)',
                textAlign: 'left',
                border: 'none',
                cursor: 'pointer',
                background: 'var(--glass-bg)',
                opacity: courses.length === 0 ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-sm)' }}>📊</div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>View Analysis</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Topic frequencies & weightage
              </div>
            </button>

            <button
              className="glass-card card-hover"
              onClick={() => courses.length > 0 && router.push(`/scheduler?course=${courses[0]?.id}`)}
              style={{
                padding: 'var(--space-xl)',
                textAlign: 'left',
                border: 'none',
                cursor: 'pointer',
                background: 'var(--glass-bg)',
                opacity: courses.length === 0 ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-sm)' }}>📅</div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Cram Planner</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Generate adaptive schedule
              </div>
            </button>

            <button
              className="glass-card card-hover"
              onClick={() => courses.length > 0 && router.push(`/recall?course=${courses[0]?.id}`)}
              style={{
                padding: 'var(--space-xl)',
                textAlign: 'left',
                border: 'none',
                cursor: 'pointer',
                background: 'var(--glass-bg)',
                opacity: courses.length === 0 ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-sm)' }}>🧠</div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Active Recall</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Flashcards & quizzes
              </div>
            </button>

            <button
              className="glass-card card-hover"
              onClick={() => courses.length > 0 && router.push(`/ask?course=${courses[0]?.id}`)}
              style={{
                padding: 'var(--space-xl)',
                textAlign: 'left',
                border: 'none',
                cursor: 'pointer',
                background: 'var(--glass-bg)',
                opacity: courses.length === 0 ? 0.5 : 1,
                borderLeft: `3px solid ${mode === 'panic' ? 'var(--accent-danger)' : mode === 'efficiency' ? 'var(--accent-warning)' : 'var(--accent-primary)'}`,
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-sm)' }}>🤖</div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Ask AI</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Query your documents
              </div>
            </button>
          </div>
        </section>

        {/* Course List */}
        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
            Your Courses
          </h2>
          
          {coursesLoading ? (
            <div className="animate-subtle-pulse" style={{ color: 'var(--text-secondary)', padding: 'var(--space-xl)' }}>
              Loading courses...
            </div>
          ) : courses.length === 0 ? (
            <div
              className="glass-card"
              style={{
                padding: 'var(--space-3xl)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>📚</div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>
                No courses yet
              </h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>
                Upload your first syllabus or past year paper to get started.
              </p>
              <button className="btn-primary" onClick={() => router.push('/upload')}>
                📄 Upload Documents
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
              {courses.map((course) => (
                <div key={course.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                  <div
                    className="glass-card card-hover"
                    style={{
                      padding: 'var(--space-lg)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      borderBottomLeftRadius: expandedCourseId === course.id ? 0 : undefined,
                      borderBottomRightRadius: expandedCourseId === course.id ? 0 : undefined,
                      borderBottom: expandedCourseId === course.id ? 'none' : undefined,
                    }}
                    onClick={() => router.push(`/analysis?course=${course.id}`)}
                  >
                    <div>
                      <h3 style={{ fontWeight: 600, fontSize: '1.05rem' }}>{course.name}</h3>
                      <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-xs)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {course.code && <span className="badge badge-primary">{course.code}</span>}
                        <span>✅ {course.documents?.[0]?.count || 0} completed</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
                      <button 
                        className="btn-secondary" 
                        onClick={(e) => toggleCourseDocuments(course.id, e)}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                      >
                        {expandedCourseId === course.id ? 'Hide Files' : 'Manage Files'}
                      </button>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '1.25rem' }}>→</span>
                    </div>
                  </div>

                  {/* Expanded Document Manager */}
                  {expandedCourseId === course.id && (
                    <div 
                      className="glass-card animate-slide-in" 
                      style={{ 
                        padding: 'var(--space-lg)', 
                        borderTopLeftRadius: 0, 
                        borderTopRightRadius: 0,
                        background: 'var(--bg-secondary)',
                        borderTop: '1px solid var(--border-subtle)'
                      }}
                    >
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--text-secondary)' }}>
                        Uploaded Documents
                      </h4>
                      {documentsLoading ? (
                        <div className="animate-subtle-pulse" style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Loading files...</div>
                      ) : courseDocuments.length === 0 ? (
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No files found for this course.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                          {courseDocuments.map(doc => (
                            <div key={doc.id} style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              padding: 'var(--space-sm) var(--space-md)',
                              background: 'var(--bg-primary)',
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid var(--border-subtle)'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                                <span title={doc.file_type} style={{ fontSize: '1.2rem' }}>
                                  {doc.file_type === 'syllabus' ? '📋' : '📝'}
                                </span>
                                <div>
                                  <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                                    {doc.file_name} 
                                    <span style={{ marginLeft: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                      ({doc.page_count || 0} pages)
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '0.75rem', marginTop: '2px', display: 'flex', gap: 'var(--space-xs)' }}>
                                    <span className={`badge ${doc.processing_status === 'completed' ? 'badge-primary' : doc.processing_status === 'failed' ? 'badge-danger' : 'badge-warning'}`} style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}>
                                      {doc.processing_status}
                                    </span>
                                    {doc.exam_year && <span className="badge badge-secondary" style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}>{doc.exam_year}</span>}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                                <button 
                                  onClick={(e) => handleReanalyzeDocument(doc.id, e)}
                                  style={{ 
                                    background: 'none', 
                                    border: 'none', 
                                    color: 'var(--text-secondary)', 
                                    cursor: 'pointer',
                                    padding: 'var(--space-xs)',
                                    opacity: 0.7 
                                  }}
                                  title="Re-analyze Document"
                                  className="card-hover"
                                >
                                  🔄
                                </button>
                                <button 
                                  onClick={(e) => handleDeleteDocument(doc.id, e)}
                                  style={{ 
                                    background: 'none', 
                                    border: 'none', 
                                    color: 'var(--accent-danger)', 
                                    cursor: 'pointer',
                                    padding: 'var(--space-xs)',
                                    opacity: 0.7 
                                  }}
                                  title="Delete Document"
                                  className="card-hover"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
