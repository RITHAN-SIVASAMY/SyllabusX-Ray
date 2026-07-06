/**
 * SyllabusX-Ray — TypeScript Type Definitions
 * =============================================
 * Shared interfaces for all data models used across the frontend.
 * These mirror the Pydantic schemas defined in the backend.
 */

// ============================================================
// Enums
// ============================================================

export type FileType = 'syllabus' | 'pyq';
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type StudyMode = 'deep_dive' | 'efficiency' | 'panic';
export type Priority = 'high' | 'medium' | 'low';
export type Trend = 'increasing' | 'decreasing' | 'stable';
export type Difficulty = 'easy' | 'medium' | 'hard';

// ============================================================
// Core Data Models
// ============================================================

export interface Course {
  id: string;
  name: string;
  code?: string;
  university?: string;
  document_count: number;
  processing_status: ProcessingStatus;
  created_at: string;
}

export interface Document {
  id: string;
  course_id: string;
  file_name: string;
  file_type: FileType;
  exam_year?: number;
  page_count?: number;
  processing_status: ProcessingStatus;
  created_at: string;
}

export interface TopicFrequency {
  topic_name: string;
  total_marks: number;
  times_appeared: number;
  years_appeared: number[];
  weightage_percent: number;
  trend: Trend;
}

export interface ModuleWeightage {
  module_name: string;
  module_number: number;
  total_marks: number;
  question_count: number;
  weightage_percent: number;
  cumulative_percent: number;
  is_high_priority: boolean;
}

// ============================================================
// API Request Types
// ============================================================

export interface UploadRequest {
  course_name: string;
  course_code?: string;
  university?: string;
  file_type: FileType;
  exam_year?: number;
}

export interface SearchQuery {
  course_id: string;
  query: string;
  mode: StudyMode;
  top_k?: number;
}

export interface SchedulerRequest {
  course_id: string;
  exam_date: string;
  hours_per_day: number;
  mode: StudyMode;
}

export interface ShareRequest {
  course_id: string;
  expires_in_hours?: number;
}

// ============================================================
// API Response Types
// ============================================================

export interface UploadResponse {
  document_id: string;
  course_id: string;
  file_name: string;
  file_type: FileType;
  page_count?: number;
  status: ProcessingStatus;
  message: string;
}

export interface SearchResponse {
  query: string;
  mode: StudyMode;
  answer: string;
  source_chunks: SourceChunk[];
  confidence_score: number;
}

export interface SourceChunk {
  content: string;
  metadata: ChunkMetadata;
  rerank_score: number;
  rank: number;
}

export interface ChunkMetadata {
  source_type: FileType;
  exam_year?: number;
  file_name: string;
  heading?: string;
}

export interface AnalysisResponse {
  course_id: string;
  course_name: string;
  mode: StudyMode;
  total_topics: number;
  topics: TopicFrequency[];
}

export interface HighYieldResponse {
  course_id: string;
  course_name: string;
  threshold_percent: number;
  high_yield_count: number;
  total_topic_count: number;
  efficiency_ratio: string;
  topics: TopicFrequency[];
}

export interface ScheduleDay {
  date: string;
  day_number: number;
  topics: string[];
  hours_allocated: number;
  priority: Priority;
  is_review: boolean;
  details: ScheduleTopicDetail[];
}

export interface ScheduleTopicDetail {
  name: string;
  hours: number;
  priority: Priority;
  trend: Trend;
}

export interface SchedulerResponse {
  course_id: string;
  course_name: string;
  exam_date: string;
  total_days: number;
  total_hours: number;
  study_hours: number;
  review_hours: number;
  topics_covered: number;
  schedule: ScheduleDay[];
}

export interface ShareResponse {
  share_url: string;
  share_token: string;
  expires_at?: string;
}

export interface FlashCard {
  id: string;
  question: string;
  answer: string;
  topic: string;
  difficulty: Difficulty;
  source_year?: number;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  topic: string;
  difficulty: Difficulty;
  marks?: number;
}

// ============================================================
// UI State Types
// ============================================================

export interface StudyModeConfig {
  mode: StudyMode;
  label: string;
  icon: string;
  description: string;
  accentColor: string;
}

export const STUDY_MODES: StudyModeConfig[] = [
  {
    mode: 'deep_dive',
    label: 'Deep Dive',
    icon: '🔬',
    description: 'Comprehensive study guides with full detail',
    accentColor: 'hsl(200, 80%, 60%)',
  },
  {
    mode: 'efficiency',
    label: '80/20 Efficiency',
    icon: '⚡',
    description: 'Only high-probability exam topics',
    accentColor: 'hsl(40, 80%, 60%)',
  },
  {
    mode: 'panic',
    label: 'Panic Mode',
    icon: '🚨',
    description: 'Essential formulas & definitions only',
    accentColor: 'hsl(0, 60%, 55%)',
  },
];
