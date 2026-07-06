/**
 * FastAPI Backend API Client
 * ============================
 * Type-safe fetch wrappers for all backend API endpoints.
 * 
 * DESIGN DECISIONS:
 * - Uses native fetch() (no axios) — reduces bundle size
 * - Automatically injects JWT from Supabase session
 * - Centralized error handling with meaningful error messages
 * - All responses are typed using the interfaces from types/index.ts
 */

import { createClient } from '@/lib/supabase/client';
import type {
  UploadResponse,
  SearchQuery,
  SearchResponse,
  AnalysisResponse,
  HighYieldResponse,
  SchedulerRequest,
  SchedulerResponse,
  ShareRequest,
  ShareResponse,
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Get the current user's JWT for API authentication.
 * Returns null if not logged in.
 */
async function getAuthToken(): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Base fetch wrapper with auth and error handling.
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  // Add auth header if logged in
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Add content-type for JSON bodies (but not FormData)
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.message || `API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

// ============================================================
// Upload API
// ============================================================

export async function uploadDocument(
  file: File,
  courseName: string,
  fileType: 'syllabus' | 'pyq',
  courseCode?: string,
  university?: string,
  examYear?: number
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('course_name', courseName);
  formData.append('file_type', fileType);
  if (courseCode) formData.append('course_code', courseCode);
  if (university) formData.append('university', university);
  if (examYear) formData.append('exam_year', String(examYear));

  return apiFetch<UploadResponse>('/api/upload/', {
    method: 'POST',
    body: formData,
  });
}

export async function getProcessingStatus(documentId: string) {
  return apiFetch<{ id: string; file_name: string; processing_status: string; page_count?: number }>(
    `/api/upload/status/${documentId}`
  );
}

export async function listCourses() {
  return apiFetch<Array<{ id: string; name: string; code?: string; documents: { count: number }[] }>>(
    '/api/upload/courses'
  );
}

export async function getCourseDocuments(courseId: string) {
  return apiFetch<Array<{
    id: string;
    file_name: string;
    file_type: 'syllabus' | 'pyq';
    processing_status: string;
    page_count: number | null;
    created_at: string;
    exam_year: number | null;
  }>>(`/api/upload/courses/${courseId}/documents`);
}

export async function deleteDocument(documentId: string) {
  return apiFetch<{ message: string }>(`/api/upload/documents/${documentId}`, {
    method: 'DELETE',
  });
}

export async function reanalyzeDocument(documentId: string) {
  return apiFetch<{ message: string; status: string }>(`/api/upload/documents/${documentId}/reanalyze`, {
    method: 'POST',
  });
}

// ============================================================
// Analysis API
// ============================================================

export async function getTopicFrequencies(courseId: string): Promise<AnalysisResponse> {
  return apiFetch<AnalysisResponse>(`/api/analysis/${courseId}/frequencies`);
}

export async function getModuleWeightage(courseId: string) {
  return apiFetch<{ course_id: string; modules: Array<import('@/types').ModuleWeightage> }>(
    `/api/analysis/${courseId}/weightage`
  );
}

export async function getHighYieldTopics(
  courseId: string,
  threshold: number = 80
): Promise<HighYieldResponse> {
  return apiFetch<HighYieldResponse>(
    `/api/analysis/${courseId}/high-yield?threshold=${threshold}`
  );
}

export async function getYearOverYearAnalysis(courseId: string) {
  return apiFetch<{ course_id: string; analysis: Record<string, unknown> }>(
    `/api/analysis/${courseId}/year-analysis`
  );
}

// ============================================================
// Search API (RAG Pipeline)
// ============================================================

export async function searchCourseMaterials(query: SearchQuery): Promise<SearchResponse> {
  return apiFetch<SearchResponse>('/api/search/', {
    method: 'POST',
    body: JSON.stringify(query),
  });
}

export async function generateFlashcards(query: SearchQuery) {
  return apiFetch<{ flashcards: Array<import('@/types').FlashCard> }>('/api/search/flashcards', {
    method: 'POST',
    body: JSON.stringify(query),
  });
}

export async function generateQuiz(query: SearchQuery) {
  return apiFetch<{ questions: Array<import('@/types').QuizQuestion> }>('/api/search/quiz', {
    method: 'POST',
    body: JSON.stringify(query),
  });
}

// ============================================================
// Scheduler API
// ============================================================

export async function generateSchedule(request: SchedulerRequest): Promise<SchedulerResponse> {
  return apiFetch<SchedulerResponse>('/api/scheduler/generate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// ============================================================
// Share API
// ============================================================

export async function createShareLink(request: ShareRequest): Promise<ShareResponse> {
  return apiFetch<ShareResponse>('/api/share/generate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getSharedProfile(shareToken: string) {
  // No auth needed for shared profiles
  const response = await fetch(`${API_BASE}/api/share/${shareToken}`);
  if (!response.ok) {
    throw new Error('Shared profile not found or expired');
  }
  return response.json();
}

export async function revokeShareLink(shareToken: string) {
  return apiFetch<{ message: string }>(`/api/share/${shareToken}`, {
    method: 'DELETE',
  });
}

// ============================================================
// Health Check
// ============================================================

export async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
