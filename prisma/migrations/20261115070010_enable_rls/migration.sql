-- Enable Row Level Security on every table, with no policies.
--
-- This is defence in depth, not the authorization model. Authorization is the
-- `owner_id` filter in the service layer; every query carries it.
--
-- What this buys: Supabase exposes PostgREST on the same database, reachable
-- with the project's publishable key. With RLS on and no policies, the `anon`
-- and `authenticated` roles can read nothing through it — so a leaked key
-- yields an empty result set rather than every user's tasks.
--
-- Why it does not break the app: the role Prisma connects as owns these tables,
-- and a table owner bypasses its own RLS unless FORCE ROW LEVEL SECURITY is
-- set. We deliberately do not set that.
--
-- This is a migration rather than a dashboard click so production gets the same
-- treatment in M8 — a fresh Supabase project does not inherit it.

ALTER TABLE "owners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "labels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_labels" ENABLE ROW LEVEL SECURITY;
