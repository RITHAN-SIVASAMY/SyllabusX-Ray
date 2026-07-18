/**
 * Study Mode Hook — useStudyMode
 * ================================
 * Manages the tri-state study mode across the application.
 * 
 * The mode controls:
 * - Which content is shown (all / high-yield / essentials only)
 * - UI accent colors (blue / amber / red)
 * - API query parameters sent to the backend
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import type { StudyMode } from '@/types';

const STORAGE_KEY = 'syllabusx-study-mode';

export function useStudyMode() {
  const [mode, setModeState] = useState<StudyMode>('efficiency');

  // Persist mode choice across browser sessions
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as StudyMode;
    if (saved && ['deep_dive', 'efficiency', 'panic'].includes(saved)) {
      Promise.resolve().then(() => {
        setModeState(saved);
      });
    }
  }, []);

  const setMode = useCallback((newMode: StudyMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
    
    // Update CSS custom property for mode-specific accent color
    const root = document.documentElement;
    switch (newMode) {
      case 'deep_dive':
        root.style.setProperty('--accent-active', 'var(--accent-primary)');
        break;
      case 'efficiency':
        root.style.setProperty('--accent-active', 'var(--accent-warning)');
        break;
      case 'panic':
        root.style.setProperty('--accent-active', 'var(--accent-danger)');
        break;
    }
  }, []);

  const getModeConfig = useCallback(() => {
    switch (mode) {
      case 'deep_dive':
        return {
          label: 'Deep Dive',
          description: 'Comprehensive study guides with full detail',
          accentClass: 'mode-deep-dive',
        };
      case 'efficiency':
        return {
          label: '80/20 Efficiency',
          description: 'Only high-probability exam topics',
          accentClass: 'mode-efficiency',
        };
      case 'panic':
        return {
          label: 'Panic Mode',
          description: 'Essential formulas & definitions only',
          accentClass: 'mode-panic',
        };
    }
  }, [mode]);

  return {
    mode,
    setMode,
    config: getModeConfig(),
    isDeepDive: mode === 'deep_dive',
    isEfficiency: mode === 'efficiency',
    isPanic: mode === 'panic',
  };
}
