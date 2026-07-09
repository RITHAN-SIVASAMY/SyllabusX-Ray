/**
 * Active Recall Arena — Flashcards & Quizzes
 * =============================================
 * Gamified study interface with flip-card animations
 * and multiple-choice quizzes from past exam patterns.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useStudyMode } from '@/hooks/useStudyMode';
import { generateFlashcards, generateQuiz } from '@/lib/api';
import type { FlashCard, QuizQuestion } from '@/types';
import CourseSelector from '@/components/CourseSelector';

export default function RecallPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { mode, config, setMode } = useStudyMode();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course');

  const [activeTab, setActiveTab] = useState<'flashcards' | 'quiz'>('flashcards');
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Flashcard state
  const [cards, setCards] = useState<FlashCard[]>([]);
  const [currentCard, setCurrentCard] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Quiz state
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [quizComplete, setQuizComplete] = useState(false);

  // History to prevent repeating questions
  const [pastQuestions, setPastQuestions] = useState<string[]>([]);
  const [pastFlashcards, setPastFlashcards] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/');
  }, [authLoading, isAuthenticated, router]);

  const handleGenerate = async () => {
    if (!courseId || !topic.trim()) {
      setError('Please enter a topic');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (activeTab === 'flashcards') {
        const result = await generateFlashcards({
          course_id: courseId,
          query: topic,
          mode,
          avoid_questions: pastFlashcards,
        });
        
        const newCards = result.flashcards || [];
        setCards(newCards.map((f: Omit<FlashCard, 'id'>, i: number) => ({ ...f, id: String(i) })));
        setCurrentCard(0);
        setFlipped(false);
        
        setPastFlashcards(prev => {
          const updated = [...prev, ...newCards.map((f: any) => f.question)];
          return updated.slice(-30);
        });
      } else {
        const result = await generateQuiz({
          course_id: courseId,
          query: topic,
          mode,
          avoid_questions: pastQuestions,
        });
        
        const newQs = result.questions || [];
        setQuestions(newQs.map((q: Omit<QuizQuestion, 'id'>, i: number) => ({ ...q, id: String(i) })));
        setCurrentQ(0);
        setSelectedAnswer(null);
        setShowExplanation(false);
        setScore(0);
        setQuizComplete(false);
        
        setPastQuestions(prev => {
          const updated = [...prev, ...newQs.map((q: any) => q.question)];
          return updated.slice(-30);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const nextCard = () => {
    if (currentCard < cards.length - 1) {
      setCurrentCard(prev => prev + 1);
      setFlipped(false);
    }
  };

  const prevCard = () => {
    if (currentCard > 0) {
      setCurrentCard(prev => prev - 1);
      setFlipped(false);
    }
  };

  const handleAnswer = (index: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(index);
    setShowExplanation(true);
    if (index === questions[currentQ].correct_index) {
      setScore(prev => prev + 1);
    }
  };

  const nextQuestion = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(prev => prev + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      setQuizComplete(true);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md) var(--space-2xl)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.25rem' }}>←</button>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 600 }}>🧠 Active Recall Arena</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
          <CourseSelector />
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            {(['deep_dive', 'efficiency', 'panic'] as const).map(m => {
            const modeColor = m === 'panic' ? 'var(--accent-danger)' : m === 'efficiency' ? 'var(--accent-warning)' : 'var(--accent-primary)';
            return (
              <button key={m} onClick={() => setMode(m)} style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', fontWeight: 600, borderRadius: 'var(--radius-md)', border: `1px solid ${mode === m ? modeColor : 'var(--border-subtle)'}`, background: mode === m ? `hsla(${m === 'panic' ? '0,60%,55%' : m === 'efficiency' ? '40,80%,60%' : '200,80%,60%'},0.1)` : 'transparent', color: mode === m ? modeColor : 'var(--text-tertiary)', cursor: 'pointer', transition: 'all 0.2s' }}>
                {m === 'deep_dive' ? '🔬 Deep Dive' : m === 'efficiency' ? '⚡ 80/20' : '🚨 Panic'}
              </button>
            );
          })}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--space-2xl)' }}>
        {/* Mode guidance */}
        <div style={{ padding: 'var(--space-sm) var(--space-md)', background: mode === 'panic' ? 'hsla(0,60%,55%,0.08)' : mode === 'efficiency' ? 'hsla(40,80%,60%,0.08)' : 'hsla(200,80%,60%,0.08)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-xl)', fontSize: '0.82rem', color: 'var(--text-secondary)', border: `1px solid ${mode === 'panic' ? 'var(--accent-danger)' : mode === 'efficiency' ? 'var(--accent-warning)' : 'var(--accent-primary)'}` }}>
          <span style={{ fontWeight: 700, color: mode === 'panic' ? 'var(--accent-danger)' : mode === 'efficiency' ? 'var(--accent-warning)' : 'var(--accent-primary)' }}>{config.icon} {config.label}:</span>{' '}
          {mode === 'panic' ? 'Flashcards and quizzes focus on the highest-priority exam topics from your past papers.' :
           mode === 'efficiency' ? 'Questions focus on high-yield topics — the 20% that covers 80% of exam marks.' :
           'Deep-dive flashcards cover all concepts with full explanations and cross-topic connections.'}
        </div>

        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-xl)' }}>
          <button className={`mode-btn ${activeTab === 'flashcards' ? 'active' : ''}`} onClick={() => setActiveTab('flashcards')}>
            🃏 Flashcards
          </button>
          <button className={`mode-btn ${activeTab === 'quiz' ? 'active' : ''}`} onClick={() => setActiveTab('quiz')}>
            ❓ Quiz
          </button>
        </div>

        {/* Topic Input */}
        <div className="glass-card" style={{ padding: 'var(--space-xl)', marginBottom: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <input
              className="input-field"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              placeholder={
                mode === 'panic' ? 'Enter topic to drill (e.g., Key Definitions, Top Formulas)' :
                mode === 'efficiency' ? 'Enter high-yield topic (e.g., Sorting, Normalization)' :
                'Enter topic to explore deeply (e.g., Binary Search Trees)'
              }
              disabled={loading}
            />
            <button className="btn-primary" onClick={handleGenerate} disabled={loading || !topic.trim() || !courseId} style={{ whiteSpace: 'nowrap' }}>
              {loading ? '⏳' : '✨ Generate'}
            </button>
          </div>
          {error && <p style={{ color: 'var(--accent-danger)', marginTop: 'var(--space-sm)', fontSize: '0.85rem' }}>{error}</p>}
        </div>

        {/* Flashcards View */}
        {activeTab === 'flashcards' && cards.length > 0 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-md)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Card {currentCard + 1} of {cards.length}
            </div>

            {/* The Card */}
            <div
              onClick={() => setFlipped(!flipped)}
              style={{
                minHeight: '280px',
                padding: 'var(--space-2xl)',
                background: flipped ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-xl)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                transition: 'all var(--transition-slow)',
                transform: flipped ? 'rotateY(0deg)' : 'rotateY(0deg)',
                boxShadow: flipped ? 'var(--shadow-lg)' : 'var(--shadow-md)',
                marginBottom: 'var(--space-lg)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {flipped ? '💡 Answer' : '❓ Question'} • Tap to flip
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 500, lineHeight: 1.6, maxWidth: '500px' }}>
                {flipped ? cards[currentCard].answer : cards[currentCard].question}
              </div>
              <div style={{ marginTop: 'var(--space-lg)' }}>
                <span className={`badge ${cards[currentCard].difficulty === 'hard' ? 'badge-danger' : cards[currentCard].difficulty === 'medium' ? 'badge-warning' : 'badge-success'}`}>
                  {cards[currentCard].difficulty}
                </span>
                {cards[currentCard].topic && (
                  <span className="badge badge-primary" style={{ marginLeft: 'var(--space-sm)' }}>
                    {cards[currentCard].topic}
                  </span>
                )}
              </div>
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-md)' }}>
              <button className="btn-secondary" onClick={prevCard} disabled={currentCard === 0}>← Previous</button>
              <button className="btn-primary" onClick={nextCard} disabled={currentCard === cards.length - 1}>Next →</button>
            </div>
          </div>
        )}

        {/* Quiz View */}
        {activeTab === 'quiz' && questions.length > 0 && !quizComplete && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-md)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <span>Question {currentQ + 1} of {questions.length}</span>
              <span>Score: {score}/{currentQ + (selectedAnswer !== null ? 1 : 0)}</span>
            </div>

            <div className="glass-card" style={{ padding: 'var(--space-xl)', marginBottom: 'var(--space-lg)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-xl)', lineHeight: 1.5 }}>
                {questions[currentQ].question}
              </h3>

              <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
                {questions[currentQ].options.map((option, i) => {
                  const isCorrect = i === questions[currentQ].correct_index;
                  const isSelected = selectedAnswer === i;
                  let bgColor = 'var(--bg-secondary)';
                  let borderColor = 'var(--border-subtle)';

                  if (selectedAnswer !== null) {
                    if (isCorrect) {
                      bgColor = 'hsla(160, 60%, 50%, 0.15)';
                      borderColor = 'var(--accent-success)';
                    } else if (isSelected) {
                      bgColor = 'hsla(0, 60%, 55%, 0.15)';
                      borderColor = 'var(--accent-danger)';
                    }
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => handleAnswer(i)}
                      disabled={selectedAnswer !== null}
                      style={{
                        padding: 'var(--space-md)',
                        background: bgColor,
                        border: `1px solid ${borderColor}`,
                        borderRadius: 'var(--radius-md)',
                        textAlign: 'left',
                        cursor: selectedAnswer !== null ? 'default' : 'pointer',
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <span style={{ fontWeight: 600, marginRight: 'var(--space-sm)', color: 'var(--text-secondary)' }}>
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {option}
                      {selectedAnswer !== null && isCorrect && ' ✅'}
                      {selectedAnswer !== null && isSelected && !isCorrect && ' ❌'}
                    </button>
                  );
                })}
              </div>

              {showExplanation && (
                <div style={{
                  marginTop: 'var(--space-lg)',
                  padding: 'var(--space-md)',
                  background: 'hsla(200, 80%, 60%, 0.1)',
                  border: '1px solid var(--accent-primary)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                }}>
                  💡 {questions[currentQ].explanation}
                </div>
              )}
            </div>

            {selectedAnswer !== null && (
              <button className="btn-primary" onClick={nextQuestion} style={{ width: '100%', padding: 'var(--space-md)' }}>
                {currentQ === questions.length - 1 ? '📊 See Results' : 'Next Question →'}
              </button>
            )}
          </div>
        )}

        {/* Quiz Complete */}
        {quizComplete && (
          <div className="glass-card" style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>
            <div style={{ fontSize: '4rem', marginBottom: 'var(--space-md)' }}>
              {score === questions.length ? '🏆' : score >= questions.length * 0.7 ? '🎉' : score >= questions.length * 0.5 ? '👍' : '📚'}
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-sm)' }}>
              {score} / {questions.length}
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)' }}>
              {score === questions.length
                ? 'Perfect score! You know this material inside out.'
                : score >= questions.length * 0.7
                ? 'Great job! You have a strong grasp of the material.'
                : 'Keep practicing! Review the topics you missed.'}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => { setQuestions([]); setQuizComplete(false); }}>
                Try Different Topic
              </button>
              <button className="btn-primary" onClick={handleGenerate}>
                🔄 Retry Same Topic
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
