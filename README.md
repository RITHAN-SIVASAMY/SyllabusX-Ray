# SyllabusX-Ray

> **Production-grade Hybrid RAG exam preparation system.** Upload your syllabus & past year papers — get the 20% of topics that account for 80% of marks.

![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.11+-green)
![Next.js](https://img.shields.io/badge/next.js-15+-black)

---

## 🧠 What This Does

Students upload their university syllabus and past year exam papers (PYQs). The system:

1. **Extracts** text from PDFs using IBM's Docling (preserves tables & multi-column layouts)
2. **Indexes** content into a hybrid vector + keyword search engine (Supabase pgvector + tsvector)
3. **Calculates** real mark frequency & weightage using deterministic SQL — no LLM guesswork
4. **Generates** focused study guides via Groq's Llama 3.3 70B with FlashRank reranking
5. **Adapts** the interface to three study modes: Deep Dive, 80/20 Efficiency, and Panic Mode

## 🏗️ Architecture

```
frontend/   → Next.js 15 (App Router) + Shadcn UI + Framer Motion + Recharts
backend/    → FastAPI + Docling + FlashRank + Groq API
database    → Supabase (PostgreSQL + pgvector + Row-Level Security)
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Python 3.11+
- A [Supabase](https://supabase.com) project (free tier)
- A [Groq](https://console.groq.com) API key (free tier)

### 1. Clone & Install

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### 2. Configure Environment

```bash
# Copy templates and fill in your keys
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

### 3. Run Database Migration

Execute `backend/migrations/001_initial_schema.sql` in your Supabase SQL Editor.

### 4. Start Development Servers

```bash
# Terminal 1: Backend
cd backend
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
SyllabusX-Ray/
├── frontend/           # Next.js 15 App Router
│   ├── src/
│   │   ├── app/        # Pages & routes
│   │   ├── components/ # UI components
│   │   ├── lib/        # Supabase clients, API wrappers
│   │   ├── hooks/      # Custom React hooks
│   │   └── types/      # TypeScript interfaces
│   └── ...
├── backend/            # FastAPI Python server
│   ├── app/
│   │   ├── auth/       # JWT verification, rate limiting
│   │   ├── routers/    # API endpoints
│   │   ├── services/   # Core business logic
│   │   ├── models/     # Pydantic schemas, DB models
│   │   └── utils/      # Text utilities, prompt guards
│   ├── migrations/     # SQL migration scripts
│   └── tests/          # Backend unit tests
└── README.md
```

## 🔒 Security

- **Auth**: Google OAuth via Supabase (PKCE flow)
- **API**: JWT verification on every request
- **Database**: Row-Level Security on all tables
- **Rate Limiting**: slowapi throttling per endpoint
- **Prompt Guards**: Regex-based injection detection

## 💰 Cost

**$0.** Everything runs on free tiers:
- Vercel (frontend hosting)
- Render / Hugging Face Spaces (backend hosting)
- Supabase (database + auth)
- Groq (LLM inference)

## 📄 License

MIT
