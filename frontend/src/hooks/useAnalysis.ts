/**
 * Analysis Data Hook — useAnalysis
 * ==================================
 * Fetches and manages analysis data for a course.
 * 
 * Provides loading states, error handling, and data refresh.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getTopicFrequencies,
  getModuleWeightage,
  getHighYieldTopics,
} from '@/lib/api';
import type { TopicFrequency, ModuleWeightage, HighYieldResponse } from '@/types';

interface AnalysisState {
  frequencies: TopicFrequency[];
  weightage: ModuleWeightage[];
  highYield: HighYieldResponse | null;
  loading: boolean;
  error: string | null;
}

export function useAnalysis(courseId: string | null) {
  const [state, setState] = useState<AnalysisState>({
    frequencies: [],
    weightage: [],
    highYield: null,
    loading: false,
    error: null,
  });

  const fetchAnalysis = useCallback(async () => {
    if (!courseId) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const [freqData, weightData, yieldData] = await Promise.all([
        getTopicFrequencies(courseId),
        getModuleWeightage(courseId),
        getHighYieldTopics(courseId),
      ]);

      setState({
        frequencies: freqData.topics || [],
        weightage: weightData.modules || [],
        highYield: yieldData,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch analysis data',
      }));
    }
  }, [courseId]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  return {
    ...state,
    refresh: fetchAnalysis,
  };
}
