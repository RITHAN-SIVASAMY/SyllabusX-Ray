# SyllabusX-Ray

SyllabusX-Ray is a full-stack AI-powered exam preparation platform. It allows students to upload their course syllabus and past year question papers (PYQs) as PDFs, extracting structured text and running deterministic analytics to identify the high-yield topics (the "80/20 rule"). It also provides a robust Hybrid RAG pipeline to answer academic questions, generate flashcards, quizzes, and personalized study schedules.

## Key Features

- **Smart PDF Extraction:** Uses IBM's Docling (DocLayNet AI) to accurately extract multi-column academic papers, preserving tables, reading order, and heading hierarchies.
- **Deterministic Analytics:** Calculates exact topic frequencies, mark distributions, and year-over-year trends using pure SQL aggregations—no LLM hallucinations.
- **Hybrid RAG Search:** Combines semantic vector search (pgvector) and exact keyword search (PostgreSQL FTS), merged via Reciprocal Rank Fusion (RRF), and refined using a FlashRank cross-encoder.
- **Adaptive Study Generation:** Generates concise cheatsheets, flashcard decks, and MCQ quizzes tailored to specific study modes (Deep Dive, Efficiency, Panic).
- **Cram Countdown Planner:** Generates adaptive study schedules prioritizing topics proportional to their historical mark weightage.
- **Peer Sharing:** Cryptographically secure, read-only share links allow students to share insights with peers.

## Tech Stack

### Frontend
![Next JS](https://img.shields.io/badge/Next-black?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)

### Backend
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)

### AI / Machine Learning
- **IBM Docling**: Local DocLayNet AI for complex PDF multi-column extraction
- **Groq API**: Llama 3.3 70B for ultra-fast generation
- **HuggingFace (`sentence-transformers`)**: Local `all-MiniLM-L6-v2` for 384-dimensional semantic embeddings
- **FlashRank**: Local `ms-marco-MiniLM-L-12-v2` for cross-encoder retrieval reranking

## Quick Start

The fastest way to run SyllabusX-Ray locally is via Docker Compose.

### Prerequisites
- Docker and Docker Compose
- A Supabase project (URL, Anon Key, Service Role Key, JWT Secret)
- A Groq API Key

### Environment Setup

1. **Backend Environment:**
   Create `backend/.env` with your credentials:
   ```env
   GROQ_API_KEY=your_groq_api_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   SUPABASE_JWT_SECRET=your_jwt_secret
   CORS_ORIGINS=http://localhost:3000
   ```

2. **Frontend Environment:**
   Create `frontend/.env.local` with your credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

3. **Database Migration:**
   Run the SQL script found in `backend/migrations/001_initial_schema.sql` in your Supabase SQL Editor to set up the tables, pgvector index, and Row-Level Security policies.

### Run the Application

```bash
docker-compose up --build
```

- **Frontend:** http://localhost:3000
- **Backend API Docs:** http://localhost:8000/docs

## Documentation

For an in-depth, interview-ready technical dive into every layer of the architecture, database schema, design decisions, and security model, please refer to the [Technical Documentation](DOCUMENTATION.md).

## Security

SyllabusX-Ray employs a multi-layered defense model:
- **Authentication:** Local JWT verification for sub-millisecond validation.
- **Database:** PostgreSQL Row-Level Security (RLS) restricts access at the engine level.
- **Prompt Injection Defense:** Regex-based sanitization for PDFs and query rejection for malicious prompts.
- **Rate Limiting:** IP-based throttling via SlowAPI.
