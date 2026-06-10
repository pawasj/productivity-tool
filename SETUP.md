# BCC Media Network Workspace — Setup Guide

## Step 1: Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project → Name it "bcc-workspace"
2. Once created, go to **SQL Editor** and paste the entire contents of `supabase-schema.sql` → Run it
3. Go to **Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Step 2: Create Your Admin Account

In Supabase Dashboard:
1. Go to **Authentication → Users → Add User**
2. Email: your email, Password: your password
3. After creating, go to **Table Editor → profiles**
4. Find your user row and change `role` to `admin`

## Step 3: Local Development

```bash
cp .env.local.example .env.local
# Fill in your Supabase URL and anon key
npm run dev
```

## Step 4: Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Or connect via Vercel Dashboard:
1. Import your GitHub repo
2. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy

## Step 5: Google Calendar Integration (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create project → Enable **Google Calendar API**
3. Create OAuth 2.0 credentials
4. Add to `.env.local`:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```
5. The meetings module already has fields for Google event IDs — full sync can be added as a Phase 2 feature

## Features

| Module | Description |
|--------|-------------|
| **Vertical Tabs** | Switch between TV, Digital, Radio, Events etc. Admin can add/edit/delete verticals |
| **To-Dos** | Per-vertical task list with priority (low/medium/high) and due dates |
| **Pending Discussions** | Log topics to discuss with specific team members |
| **Meetings** | Upcoming meetings with Google Meet links and team assignment |
| **Important Notes** | Pinnable sticky notes per vertical |
| **Team Discussions** | Threaded discussions with replies |
| **Pipeline (per vertical)** | Mini CRM preview with top 5 active leads |
| **Sales Pipeline (full)** | Full CRM with filters by status, vertical, POC, location, value |
| **Admin Panel** | Add team members, manage roles |

## Adding Team Members (Admin)

1. Login as admin → Sidebar → **Admin Panel**
2. Click **Add Member** → Fill name, email, temporary password, role
3. Share credentials with team member — they can change password via Supabase auth

## Architecture

- **Frontend**: Next.js 16 (App Router) + Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Deployment**: Vercel
- **Auth**: Supabase email/password (invite-only)
