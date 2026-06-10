# Flowchat — Claude Context File
> Paste this at the start of new Claude conversations to skip re-explaining everything.

---

## 1. What Is Flowchat

Flowchat (flowchat.now) is a SaaS that lets non-technical users create automations by describing them in plain English via chat. Under the hood it uses n8n to execute workflows. Users never see n8n — they only interact with the chat interface.

**Tagline:** "Automate anything. Just say it."

---

## 2. Tech Stack

**Frontend:** Next.js 14 (App Router) → Vercel
- Repo: `https://github.com/MarkBojeHording/flowchat`
- Local: `/Users/markhording/Desktop/flowchat/flowchat-landing`
- Supabase Auth for user accounts

**Backend:** Express.js → Railway
- Local: `/Users/markhording/Desktop/flowchat/flowchat-backend`
- n8n API integration
- OAuth handlers for Google and Slack

**Execution engine:** n8n self-hosted on Railway
- URL: `https://main-production-0c5e.up.railway.app`
- PostgreSQL + Redis (queue mode)

**Database:** Supabase
- URL: `https://awwzpwhxpglswkncjhbt.supabase.co`
- Tables: platform_accounts, workflows, executions

**AI:** Anthropic Claude API (claude-haiku-4-5)
- Used to interpret plain English automation requests into structured JSON

---

## 3. Current Status

### ✅ Working
- Landing page with real Claude demo (interprets user request via API)
- Signup/login flow via Supabase Auth
- Email confirmation flow → redirects to /connect
- Google OAuth (Gmail + Sheets) — tokens saved to Supabase
- Slack OAuth — tokens saved to Supabase
- Dashboard with chat interface
- Chat → Claude interprets → n8n workflow created and activated
- Workflows visible in n8n dashboard
- Supabase credentials endpoint for n8n to fetch user tokens at runtime

### ❌ Not Yet Working
- Workflows use placeholder nodes — don't actually call Gmail/Slack/Sheets APIs
- No real automation execution (tokens not yet passed to n8n nodes)
- No active automations list in dashboard
- Not deployed to production yet
- Domain not purchased yet (flowchat.now available for ~$23/year)
- No Stripe billing

---

## 4. Key Architecture Decisions

**Dynamic credentials:** n8n workflows use HTTP Request nodes to fetch user OAuth tokens from the backend at runtime. This means one n8n instance serves all users securely.

**Workflow creation flow:**
1. User types plain English in chat
2. Frontend calls POST /api/interpret (Next.js API route)
3. Claude API returns structured JSON: { trigger, actions, name, description }
4. Frontend calls POST /api/workflows/create on backend
5. Backend generates n8n workflow JSON and deploys via n8n API
6. Workflow activated and saved to Supabase

**Supported apps (OAuth done):**
- Google (Gmail + Sheets) ✅
- Slack ✅
- Typeform (planned)
- Airtable (planned)

---

## 5. Supabase Schema

```sql
platform_accounts (id, user_id, platform, email, access_token, refresh_token, updated_at)
workflows (id, user_id, n8n_workflow_id, name, description, status, trigger_app, action_apps, created_at)
executions (id, workflow_id, user_id, status, error, ran_at)
```

---

## 6. Key Files

**Frontend (`flowchat-landing`):**
- `src/app/page.tsx` — landing page with interactive Claude demo
- `src/app/dashboard/page.tsx` — chat interface for logged-in users
- `src/app/signup/page.tsx` — signup page
- `src/app/login/page.tsx` — login page
- `src/app/connect/page.tsx` — connect apps page
- `src/app/auth/confirm/route.ts` — email confirmation handler
- `src/app/api/interpret/route.ts` — Claude API interpretation endpoint

**Backend (`flowchat-backend`):**
- `src/server.js` — Express server
- `src/routes/auth.js` — Google + Slack OAuth, credentials endpoint
- `src/routes/workflows.js` — workflow creation endpoint
- `src/services/n8n.js` — n8n API client
- `src/services/workflowBuilder.js` — builds n8n workflow JSON

---

## 7. Environment Variables

**flowchat-landing/.env.local:**
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- ANTHROPIC_API_KEY
- NEXT_PUBLIC_BACKEND_URL=http://localhost:3456

**flowchat-backend/.env:**
- PORT=3456
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- ANTHROPIC_API_KEY
- N8N_BASE_URL=https://main-production-0c5e.up.railway.app
- N8N_API_KEY
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URI
- SLACK_CLIENT_ID
- SLACK_CLIENT_SECRET
- SLACK_REDIRECT_URI
- INTERNAL_API_KEY

---

## 8. Working Style

- Claude for architecture, debugging, research, Cursor prompts
- Cursor for implementation
- All technical instructions formatted as ready-to-paste Cursor prompts
- Step by step with validation before proceeding
- Mark works 30-60 min/day, with 2-3 weeks intensive building time in Lombok (July/August 2026)

## 9. Next Priorities

1. Make workflows actually execute real actions (Slack messages, Gmail, Sheets)
2. Show active automations list in dashboard
3. Deploy frontend to Vercel
4. Buy flowchat.now domain
5. Stripe billing
6. Token refresh for Google and Slack
