# Supabase Setup Guide for SyllabusX-Ray

This guide will walk you through setting up a Supabase project and connecting it to the SyllabusX-Ray backend. Supabase handles our PostgreSQL database, authentication, row-level security, and vector similarity search (pgvector).

## Step 1: Create a Supabase Project

1. Go to [Supabase](https://supabase.com/) and sign up or log in.
2. Click **"New Project"**.
3. Select your organization, give your project a name (e.g., `SyllabusX-Ray`), and generate a secure database password.
4. Choose a region closest to you and click **"Create New Project"**.
5. Wait a few minutes for the database to finish provisioning.

---

## Step 2: Get Your API Keys

You need to connect your local environment to your new Supabase project.

1. Once your project is ready, click the **Settings (gear icon)** at the bottom of the left sidebar.
2. Go to **API** under the Configuration section.
3. Copy the **Project URL**.
4. Copy the **anon / public** API key.
5. Copy the **service_role** API key (keep this secret!).
6. Go to **JWT Settings** (still on the API page or under Auth -> Configuration -> Advanced) and copy the **JWT Secret**.

Now, open `backend/.env.example`, copy its contents into a new file named `backend/.env`, and update the Supabase section with the keys you just copied:

```env
# --- Supabase ---
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret
```

---

## Step 3: Run the Database Migrations

SyllabusX-Ray requires specific tables, Row Level Security (RLS) policies, and stored SQL functions to work. We have provided all of this in a single migration file.

1. In your Supabase Dashboard, click on the **SQL Editor** (the `< / >` icon in the left sidebar).
2. Click **"New query"**.
3. Open the local file: `backend/migrations/001_initial_schema.sql`.
4. Copy the entire contents of `001_initial_schema.sql` and paste it into the Supabase SQL Editor.
5. Click **"Run"** (or press `Cmd/Ctrl + Enter`).

> [!NOTE]  
> The migration script automatically enables the `pgvector` extension and creates all necessary tables (`user_profiles`, `courses`, `documents`, `document_chunks`, `pyq_questions`, `syllabus_topics`, `analysis_results`, `shared_profiles`).

---

## Step 4: Verify Your Setup

To ensure everything is working:

1. Go to the **Table Editor** (the table icon in the left sidebar) in Supabase.
2. Verify that you see the 8 tables listed above.
3. Check the **Authentication** tab -> **Users** to ensure Auth is enabled and ready.

You're all set! You can now start the SyllabusX-Ray backend.
