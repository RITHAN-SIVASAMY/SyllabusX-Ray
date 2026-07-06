-- ===========================================================
-- SyllabusX-Ray — Initial Database Schema Migration
-- ===========================================================
-- RUN THIS in your Supabase SQL Editor (Dashboard → SQL Editor)
-- 
-- PREREQUISITES:
--   1. Enable pgvector extension: Dashboard → Database → Extensions → search "vector" → Enable
--   2. This script creates all tables, indexes, RLS policies, and stored functions
--
-- WHAT THIS CREATES:
--   - 8 tables (user_profiles, courses, documents, document_chunks, 
--               pyq_questions, syllabus_topics, analysis_results, shared_profiles)
--   - Vector similarity search function
--   - Keyword search function
--   - Frequency calculation functions
--   - Row-Level Security policies on all tables
--   - Performance indexes

-- ===========================================================
-- EXTENSION: pgvector (for vector similarity search)
-- ===========================================================
-- NOTE: You should also enable this via the Supabase Dashboard UI.
-- This CREATE EXTENSION is idempotent (safe to run multiple times).
CREATE EXTENSION IF NOT EXISTS vector;

-- ===========================================================
-- TABLE: user_profiles
-- ===========================================================
-- Extends Supabase Auth's built-in users table with app-specific fields.
-- The id references auth.users(id), so when a user is deleted from Auth,
-- their profile is automatically cascade-deleted.
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    university TEXT,
    department TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================================
-- TABLE: courses
-- ===========================================================
-- Each student can have multiple courses (e.g., "CS402 Data Structures")
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    university TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================================
-- TABLE: documents
-- ===========================================================
-- Tracks each uploaded PDF file and its processing status.
-- file_type distinguishes syllabi from past year papers (PYQs).
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('syllabus', 'pyq')),
    exam_year INTEGER,
    raw_markdown TEXT,
    page_count INTEGER,
    processing_status TEXT DEFAULT 'pending' 
        CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================================
-- TABLE: document_chunks
-- ===========================================================
-- The core RAG table. Each row is a text chunk with its vector embedding.
-- 
-- KEY COLUMNS:
--   embedding: 384-dimensional vector (all-MiniLM-L6-v2 output)
--   fts_vector: Auto-generated tsvector for PostgreSQL full-text search
--   metadata: JSONB storing source_type, exam_year, file_name, heading
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding vector(384),
    fts_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================================
-- TABLE: pyq_questions
-- ===========================================================
-- Structured representation of individual exam questions.
-- This is what the frequency engine queries for deterministic analytics.
-- 
-- Each row = one question from one exam paper, with its topic mapping and marks.
CREATE TABLE IF NOT EXISTS pyq_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    question_number TEXT,
    question_text TEXT NOT NULL,
    topic_name TEXT,
    marks INTEGER,
    exam_year INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================================
-- TABLE: syllabus_topics
-- ===========================================================
-- Structured syllabus data: modules and their subtopics.
-- Used to map PYQ questions to syllabus modules for weightage calculation.
CREATE TABLE IF NOT EXISTS syllabus_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    module_number INTEGER,
    module_name TEXT NOT NULL,
    topic_name TEXT NOT NULL,
    subtopics TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================================
-- TABLE: analysis_results
-- ===========================================================
-- Cached analysis outputs (frequencies, study guides, flashcards).
-- mode determines which study mode the analysis was generated for.
CREATE TABLE IF NOT EXISTS analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    analysis_type TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('deep_dive', 'efficiency', 'panic')),
    result_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================================
-- TABLE: shared_profiles
-- ===========================================================
-- Cryptographic share tokens for the peer-share engine.
-- share_token is a unique URL-safe string that grants read-only access.
CREATE TABLE IF NOT EXISTS shared_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
    creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    share_token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ===========================================================
-- INDEXES (Performance Optimization)
-- ===========================================================

-- Chunk lookups by course (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_chunks_course ON document_chunks(course_id);

-- Vector similarity search (IVFFlat index for approximate nearest neighbor)
-- lists=100 means 100 cluster centroids — good for up to ~100K chunks
CREATE INDEX IF NOT EXISTS idx_chunks_embedding 
    ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Full-text search using GIN (Generalized Inverted Index)
CREATE INDEX IF NOT EXISTS idx_chunks_fts ON document_chunks USING GIN (fts_vector);

-- PYQ queries by course and topic (for frequency calculations)
CREATE INDEX IF NOT EXISTS idx_pyq_course_topic ON pyq_questions(course_id, topic_name);
CREATE INDEX IF NOT EXISTS idx_pyq_year ON pyq_questions(exam_year);

-- Shared profiles by token (for fast lookup when someone opens a share link)
CREATE INDEX IF NOT EXISTS idx_shared_token ON shared_profiles(share_token);


-- ===========================================================
-- ROW LEVEL SECURITY (RLS)
-- ===========================================================
-- This is the MOST IMPORTANT security layer.
-- Even if an attacker gains API access, they cannot read/modify other users' data.

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyq_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE syllabus_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_profiles ENABLE ROW LEVEL SECURITY;

-- User profiles: users can only see/edit their own profile
DROP POLICY IF EXISTS "Users manage own profile" ON user_profiles;
CREATE POLICY "Users manage own profile" ON user_profiles
    FOR ALL USING (auth.uid() = id);

-- Courses: users can only see/manage their own courses
DROP POLICY IF EXISTS "Users manage own courses" ON courses;
CREATE POLICY "Users manage own courses" ON courses
    FOR ALL USING (auth.uid() = user_id);

-- Documents: users can only see/manage their own documents
DROP POLICY IF EXISTS "Users manage own documents" ON documents;
CREATE POLICY "Users manage own documents" ON documents
    FOR ALL USING (auth.uid() = user_id);

-- Chunks: users can only query their own chunks
DROP POLICY IF EXISTS "Users query own chunks" ON document_chunks;
CREATE POLICY "Users query own chunks" ON document_chunks
    FOR ALL USING (auth.uid() = user_id);

-- PYQ questions: users access their own structured question data
DROP POLICY IF EXISTS "Users access own PYQ data" ON pyq_questions;
CREATE POLICY "Users access own PYQ data" ON pyq_questions
    FOR ALL USING (auth.uid() = user_id);

-- Syllabus topics: users manage their own syllabus structure
DROP POLICY IF EXISTS "Users manage own syllabus" ON syllabus_topics;
CREATE POLICY "Users manage own syllabus" ON syllabus_topics
    FOR ALL USING (auth.uid() = user_id);

-- Analysis results: users view their own cached results
DROP POLICY IF EXISTS "Users view own analysis" ON analysis_results;
CREATE POLICY "Users view own analysis" ON analysis_results
    FOR ALL USING (auth.uid() = user_id);

-- Shared profiles: creators manage their own shares
DROP POLICY IF EXISTS "Creators manage shares" ON shared_profiles;
CREATE POLICY "Creators manage shares" ON shared_profiles
    FOR ALL USING (auth.uid() = creator_id);

-- Shared profiles: ANYONE can read shared profiles (that's the point of sharing)
DROP POLICY IF EXISTS "Public read shared profiles" ON shared_profiles;
CREATE POLICY "Public read shared profiles" ON shared_profiles
    FOR SELECT USING (true);


-- ===========================================================
-- STORED FUNCTIONS (Called via Supabase RPC)
-- ===========================================================

-- Function: Vector similarity search
-- Called by: hybrid_search.py → _vector_search()
CREATE OR REPLACE FUNCTION match_document_chunks(
    query_embedding vector(384),
    match_course_id UUID,
    match_count INT DEFAULT 30,
    filter_source_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.content,
        dc.metadata,
        1 - (dc.embedding <=> query_embedding) AS similarity
    FROM document_chunks dc
    WHERE dc.course_id = match_course_id
      AND (filter_source_type IS NULL OR dc.metadata->>'source_type' = filter_source_type)
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function: Keyword (full-text) search
-- Called by: hybrid_search.py → _keyword_search()
CREATE OR REPLACE FUNCTION keyword_search_chunks(
    search_query TEXT,
    match_course_id UUID,
    match_count INT DEFAULT 30,
    filter_source_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    metadata JSONB,
    rank FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.content,
        dc.metadata,
        ts_rank_cd(dc.fts_vector, plainto_tsquery('english', search_query)) AS rank
    FROM document_chunks dc
    WHERE dc.course_id = match_course_id
      AND dc.fts_vector @@ plainto_tsquery('english', search_query)
      AND (filter_source_type IS NULL OR dc.metadata->>'source_type' = filter_source_type)
    ORDER BY rank DESC
    LIMIT match_count;
END;
$$;

-- Function: Calculate topic frequencies
-- Called by: frequency_engine.py → get_topic_frequencies()
-- THIS IS PURE SQL — NO LLM INVOLVED
CREATE OR REPLACE FUNCTION calculate_topic_frequencies(
    target_course_id UUID
)
RETURNS TABLE (
    topic_name TEXT,
    total_marks BIGINT,
    times_appeared BIGINT,
    years_appeared INT[]
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pq.topic_name,
        COALESCE(SUM(pq.marks), 0)::BIGINT AS total_marks,
        COUNT(*)::BIGINT AS times_appeared,
        ARRAY_AGG(DISTINCT pq.exam_year ORDER BY pq.exam_year) AS years_appeared
    FROM pyq_questions pq
    WHERE pq.course_id = target_course_id
      AND pq.topic_name IS NOT NULL
    GROUP BY pq.topic_name
    ORDER BY total_marks DESC;
END;
$$;

-- Function: Calculate module-level weightage
-- Called by: frequency_engine.py → get_module_weightage()
CREATE OR REPLACE FUNCTION calculate_module_weightage(
    target_course_id UUID
)
RETURNS TABLE (
    module_name TEXT,
    module_number INT,
    total_marks BIGINT,
    question_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        st.module_name,
        st.module_number,
        COALESCE(SUM(pq.marks), 0)::BIGINT AS total_marks,
        COUNT(pq.id)::BIGINT AS question_count
    FROM syllabus_topics st
    LEFT JOIN pyq_questions pq 
        ON pq.course_id = st.course_id 
        AND pq.topic_name = st.topic_name
    WHERE st.course_id = target_course_id
    GROUP BY st.module_name, st.module_number
    ORDER BY total_marks DESC;
END;
$$;

-- Function: Year-over-year analysis
-- Called by: frequency_engine.py → get_year_over_year_analysis()
CREATE OR REPLACE FUNCTION year_over_year_analysis(
    target_course_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'years_analyzed', (
            SELECT jsonb_agg(DISTINCT exam_year ORDER BY exam_year)
            FROM pyq_questions
            WHERE course_id = target_course_id AND exam_year IS NOT NULL
        ),
        'total_papers', (
            SELECT COUNT(DISTINCT document_id)
            FROM pyq_questions
            WHERE course_id = target_course_id
        ),
        'topics_per_year', (
            SELECT jsonb_object_agg(
                year_text,
                topic_list
            )
            FROM (
                SELECT 
                    exam_year::TEXT AS year_text,
                    jsonb_agg(DISTINCT topic_name) AS topic_list
                FROM pyq_questions
                WHERE course_id = target_course_id
                  AND exam_year IS NOT NULL
                  AND topic_name IS NOT NULL
                GROUP BY exam_year
            ) sub
        )
    ) INTO result;
    
    RETURN COALESCE(result, '{}'::JSONB);
END;
$$;


-- ===========================================================
-- TRIGGER: Auto-create user profile on signup
-- ===========================================================
-- When a new user signs up via Supabase Auth, automatically
-- create a row in user_profiles so we can extend their profile.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, display_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );
    RETURN NEW;
END;
$$;

-- Create trigger (drop first to make this idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();


-- ===========================================================
-- DONE! 
-- Your database is ready for SyllabusX-Ray.
-- ===========================================================
