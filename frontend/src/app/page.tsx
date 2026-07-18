/**
 * SyllabusX-Ray — Landing Page
 * ==============================
 * The hero page that greets students. Features:
 * - Animated gradient background
 * - Feature showcase with scroll animations
 * - Google OAuth CTA button
 * - Mobile-responsive layout
 */

'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Microscope, LogIn, Target, Zap, Clock, ShieldCheck, FileText, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';

const FEATURES = [
  {
    icon: '📄',
    title: 'Smart PDF Extraction',
    description:
      'IBM Docling preserves tables, multi-column layouts, and reading order from your exam papers. No more garbled text.',
  },
  {
    icon: '🔍',
    title: 'Hybrid RAG Search',
    description:
      'Combines semantic AI understanding with exact keyword matching. Finds concepts AND specific codes like CS402 or O(n log n).',
  },
  {
    icon: '📊',
    title: 'Deterministic Analytics',
    description:
      'Real SQL calculations, not LLM guesswork. Every percentage and frequency number is mathematically verified.',
  },
  {
    icon: '🎯',
    title: '80/20 Pareto Analysis',
    description:
      'Automatically identifies the smallest set of topics that historically cover 80% of exam marks.',
  },
  {
    icon: '🧠',
    title: 'Adaptive Study Modes',
    description:
      'Deep Dive for thorough study, 80/20 Efficiency for focused prep, and Panic Mode for last-minute revision.',
  },
  {
    icon: '📅',
    title: 'Cram Countdown Planner',
    description:
      'Input your exam date and daily study hours. Get a schedule proportional to topic importance.',
  },
];

export default function LandingPage() {
  const { isAuthenticated, signInWithGoogle, loading } = useAuth();
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGetStarted = async () => {
    if (isAuthenticated) {
      router.push('/dashboard');
      return;
    }
    
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen gradient-animated">
      {/* Navigation */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-md) var(--space-2xl)',
          borderBottom: '1px solid var(--border-subtle)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <span style={{ fontSize: '1.5rem' }}>🔬</span>
          <span
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            SyllabusX-Ray
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <ThemeToggle />
          {isAuthenticated ? (
            <button className="btn-neo" onClick={() => router.push('/dashboard')}>
              Dashboard →
            </button>
          ) : (
            <button
              className="btn-neo"
              onClick={handleGetStarted}
              disabled={isSigningIn || loading}
            >
              {isSigningIn ? 'Connecting...' : 'Get Started — Free'}
            </button>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 'var(--space-3xl) var(--space-xl)',
          maxWidth: '900px',
          margin: '0 auto',
          minHeight: '70vh',
        }}
      >
        {/* Badge */}
        <div
          className="badge badge-primary neo-inset animate-slide-in"
          style={{ marginBottom: 'var(--space-lg)', padding: '0.35rem 1rem', fontSize: '0.8rem' }}
        >
          ⚡ Powered by Hybrid RAG + Deterministic SQL
        </div>

        {/* Headline */}
        <h1
          className="animate-slide-in delay-100"
          style={{
            fontSize: 'clamp(2.2rem, 5vw, 3.8rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: 'var(--space-lg)',
            letterSpacing: '-0.03em',
          }}
        >
          Find the{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, var(--accent-warning), hsl(30, 90%, 55%))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            20% of topics
          </span>{' '}
          that score{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            80% of marks
          </span>
        </h1>

        {/* Subheadline */}
        <p
          className="animate-slide-in delay-200"
          style={{
            fontSize: 'clamp(1rem, 2vw, 1.25rem)',
            color: 'var(--text-secondary)',
            maxWidth: '650px',
            marginBottom: 'var(--space-2xl)',
            lineHeight: 1.7,
          }}
        >
          Upload your syllabus and past year papers. Our Hybrid AI pipeline
          extracts, analyzes, and ranks every topic by real historical exam
          frequency — not guesswork.
        </p>

        {/* CTA Buttons */}
        <div
          className="animate-slide-in delay-300"
          style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', justifyContent: 'center' }}
        >
          <button
            className="btn-neo"
            onClick={handleGetStarted}
            disabled={isSigningIn || loading}
            style={{ padding: 'var(--space-md) var(--space-2xl)', fontSize: '1rem' }}
          >
            {isAuthenticated
              ? '→ Go to Dashboard'
              : isSigningIn
              ? '⏳ Connecting...'
              : '🚀 Start Free with Google'}
          </button>
          <a
            href="#features"
            className="btn-neo"
            style={{ padding: 'var(--space-md) var(--space-2xl)', fontSize: '1rem', color: 'var(--text-primary)' }}
          >
            See How It Works ↓
          </a>
        </div>

        {/* Trust indicators */}
        <div
          className="animate-slide-in delay-400"
          style={{
            display: 'flex',
            gap: 'var(--space-xl)',
            marginTop: 'var(--space-2xl)',
            color: 'var(--text-tertiary)',
            fontSize: '0.8rem',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <span>🔒 Zero cost, forever</span>
          <span>📊 SQL-verified analytics</span>
          <span>🛡️ Row-level data isolation</span>
          <span>⚡ Groq-powered speed</span>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        style={{
          padding: 'var(--space-3xl) var(--space-xl)',
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        <h2
          style={{
            textAlign: 'center',
            fontSize: '2rem',
            fontWeight: 700,
            marginBottom: 'var(--space-sm)',
          }}
        >
          Everything You Need to{' '}
          <span style={{ color: 'var(--accent-primary)' }}>Ace Your Exams</span>
        </h2>
        <p
          style={{
            textAlign: 'center',
            color: 'var(--text-secondary)',
            marginBottom: 'var(--space-3xl)',
            maxWidth: '600px',
            margin: '0 auto var(--space-3xl)',
          }}
        >
          A complete exam preparation workspace that replaces manual
          cross-referencing with automated, data-driven insights.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 'var(--space-lg)',
          }}
        >
          {FEATURES.map((feature, index) => (
            <div
              key={feature.title}
              className="neo-card animate-slide-in"
              style={{
                padding: 'var(--space-xl)',
                animationDelay: `${index * 100}ms`,
              }}
            >
              <div
                style={{
                  fontSize: '2rem',
                  marginBottom: 'var(--space-md)',
                  width: '3rem',
                  height: '3rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-tertiary)',
                }}
              >
                {feature.icon}
              </div>
              <h3
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  marginBottom: 'var(--space-sm)',
                  color: 'var(--text-primary)',
                }}
              >
                {feature.title}
              </h3>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.9rem',
                  lineHeight: 1.6,
                }}
              >
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pipeline visualization */}
      <section
        style={{
          padding: 'var(--space-3xl) var(--space-xl)',
          maxWidth: '900px',
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 'var(--space-2xl)' }}>
          The RAG Pipeline
        </h2>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-md)',
            alignItems: 'center',
          }}
        >
          {[
            { step: '1', label: 'Upload PDFs', detail: 'Syllabus + Past Year Papers' },
            { step: '2', label: 'Docling Extraction', detail: 'Tables & layout preserved' },
            { step: '3', label: 'Chunk & Embed', detail: '512-token semantic chunks' },
            { step: '4', label: 'Hybrid Search', detail: 'Vector + Keyword + RRF fusion' },
            { step: '5', label: 'FlashRank Reranking', detail: 'CPU cross-encoder scoring' },
            { step: '6', label: 'Groq LLM Response', detail: 'Structured JSON via Llama 3.3' },
          ].map((step, i) => (
            <div key={step.step} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', width: '100%', maxWidth: '500px' }}>
              <div
                className="animate-slide-in"
                style={{
                  animationDelay: `${i * 150}ms`,
                  width: '3rem',
                  height: '3rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '1rem',
                  flexShrink: 0,
                }}
              >
                {step.step}
              </div>
              <div
                className="neo-card animate-slide-in"
                style={{
                  animationDelay: `${i * 150 + 50}ms`,
                  padding: 'var(--space-sm) var(--space-lg)',
                  flex: 1,
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{step.label}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{step.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          padding: 'var(--space-2xl) var(--space-xl)',
          borderTop: '1px solid var(--border-subtle)',
          textAlign: 'center',
          color: 'var(--text-tertiary)',
          fontSize: '0.85rem',
        }}
      >
        <p>
          SyllabusX-Ray — Built with Next.js, FastAPI, Docling, Groq & Supabase.
          <br />
          100% free, forever. Your data stays yours.
        </p>
      </footer>
    </div>
  );
}
