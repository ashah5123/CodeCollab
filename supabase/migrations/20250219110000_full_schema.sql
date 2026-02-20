-- CodeCollab: Full schema for submissions, comments, chat, orgs, presence, executions, collab
-- Run in Supabase SQL Editor. Requires auth.users (Supabase Auth).
-- Create tables in dependency order; then RLS; then realtime.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABLES (parent tables first)
-- =============================================================================

-- Organisations (no FK to other app tables)
CREATE TABLE public.organisations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  invite_code TEXT UNIQUE DEFAULT substring(md5(random()::text), 1, 8),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Collab rooms (backend: collab.py expects id, name, description, language, code, created_by, creator_email, is_active, created_at)
CREATE TABLE public.collab_rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  language TEXT NOT NULL DEFAULT 'python',
  code TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Submissions (user code submissions for review)
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id UUID,
  title TEXT DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'python',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat messages (room-scoped; room_id can reference rooms(id) or collab_rooms(id) from app logic)
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments (on submissions)
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Organisation members
CREATE TABLE public.organisation_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organisation_id, user_id)
);

-- Org-scoped chat
CREATE TABLE public.org_chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Direct messages (1:1)
CREATE TABLE public.direct_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Session presence (who is where)
CREATE TABLE public.session_presence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id UUID,
  session_key TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Code executions (run code linked to a submission)
CREATE TABLE public.code_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID REFERENCES public.submissions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'python',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'error')),
  output TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reactions on chat messages
CREATE TABLE public.chat_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL DEFAULT 'emoji',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chat_message_id, user_id, reaction_type)
);

-- Reactions on submissions
CREATE TABLE public.submission_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, user_id, reaction_type)
);

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Collab room members (backend: collab.py expects id, room_id, user_id, user_email, user_color, joined_at; UNIQUE(room_id, user_id))
CREATE TABLE public.collab_room_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.collab_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  user_color TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX idx_submissions_user_id ON public.submissions(user_id);
CREATE INDEX idx_submissions_created_at ON public.submissions(created_at);
CREATE INDEX idx_comments_submission_id ON public.comments(submission_id);
CREATE INDEX idx_chat_messages_room_id ON public.chat_messages(room_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(room_id, created_at);
CREATE INDEX idx_chat_reactions_chat_message_id ON public.chat_reactions(chat_message_id);
CREATE INDEX idx_submission_reactions_submission_id ON public.submission_reactions(submission_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_organisations_slug ON public.organisations(slug);
CREATE INDEX idx_organisation_members_organisation_id ON public.organisation_members(organisation_id);
CREATE INDEX idx_organisation_members_user_id ON public.organisation_members(user_id);
CREATE INDEX idx_org_chat_messages_organisation_id ON public.org_chat_messages(organisation_id);
CREATE INDEX idx_direct_messages_sender_receiver ON public.direct_messages(sender_id, receiver_id);
CREATE INDEX idx_session_presence_user_id ON public.session_presence(user_id);
CREATE INDEX idx_session_presence_room_id ON public.session_presence(room_id);
CREATE INDEX idx_code_executions_submission_id ON public.code_executions(submission_id);
CREATE INDEX idx_collab_room_members_room_id ON public.collab_room_members(room_id);
CREATE INDEX idx_collab_room_members_user_id ON public.collab_room_members(user_id);

-- =============================================================================
-- ROW LEVEL SECURITY (enable then policies)
-- =============================================================================
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_room_members ENABLE ROW LEVEL SECURITY;

-- Submissions: users see own and others' (or restrict as needed)
CREATE POLICY "Users can view submissions" ON public.submissions FOR SELECT USING (true);
CREATE POLICY "Users can insert own submissions" ON public.submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own submissions" ON public.submissions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own submissions" ON public.submissions FOR DELETE USING (auth.uid() = user_id);

-- Comments: anyone can read; author can insert/update/delete own
CREATE POLICY "Users can view comments" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Users can insert own comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can update own comments" ON public.comments FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Authors can delete own comments" ON public.comments FOR DELETE USING (auth.uid() = author_id);

-- Chat messages: anyone can read; users insert as themselves
CREATE POLICY "Users can view chat_messages" ON public.chat_messages FOR SELECT USING (true);
CREATE POLICY "Users can insert chat_messages" ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own chat_messages" ON public.chat_messages FOR DELETE USING (auth.uid() = user_id);

-- Chat reactions
CREATE POLICY "Users can view chat_reactions" ON public.chat_reactions FOR SELECT USING (true);
CREATE POLICY "Users can insert own chat_reactions" ON public.chat_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own chat_reactions" ON public.chat_reactions FOR DELETE USING (auth.uid() = user_id);

-- Submission reactions
CREATE POLICY "Users can view submission_reactions" ON public.submission_reactions FOR SELECT USING (true);
CREATE POLICY "Users can insert own submission_reactions" ON public.submission_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own submission_reactions" ON public.submission_reactions FOR DELETE USING (auth.uid() = user_id);

-- Notifications: user sees only own
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);

-- Organisations
CREATE POLICY "Users can view organisations" ON public.organisations FOR SELECT USING (true);
CREATE POLICY "Users can create organisations" ON public.organisations FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Org owners can update" ON public.organisations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.organisation_members WHERE organisation_id = id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
);
CREATE POLICY "Org owners can delete" ON public.organisations FOR DELETE USING (created_by = auth.uid());

-- Organisation members
CREATE POLICY "Users can view organisation_members" ON public.organisation_members FOR SELECT USING (true);
CREATE POLICY "Org owners/admins can insert members" ON public.organisation_members FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.organisation_members m WHERE m.organisation_id = organisation_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin'))
);
CREATE POLICY "Users can join organisations" ON public.organisation_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave organisation" ON public.organisation_members FOR DELETE USING (auth.uid() = user_id);

-- Org chat messages
CREATE POLICY "Org members can view org_chat_messages" ON public.org_chat_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.organisation_members m WHERE m.organisation_id = org_chat_messages.organisation_id AND m.user_id = auth.uid())
);
CREATE POLICY "Org members can insert org_chat_messages" ON public.org_chat_messages FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.organisation_members m WHERE m.organisation_id = organisation_id AND m.user_id = auth.uid())
);
CREATE POLICY "Authors can delete own org_chat_messages" ON public.org_chat_messages FOR DELETE USING (auth.uid() = user_id);

-- Direct messages: sender or receiver only
CREATE POLICY "Users can view own direct_messages" ON public.direct_messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users can send direct_messages" ON public.direct_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can delete own direct_messages" ON public.direct_messages FOR DELETE USING (auth.uid() = sender_id);

-- Session presence: users manage own presence
CREATE POLICY "Users can view session_presence" ON public.session_presence FOR SELECT USING (true);
CREATE POLICY "Users can insert own session_presence" ON public.session_presence FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own session_presence" ON public.session_presence FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own session_presence" ON public.session_presence FOR DELETE USING (auth.uid() = user_id);

-- Code executions
CREATE POLICY "Users can view code_executions" ON public.code_executions FOR SELECT USING (true);
CREATE POLICY "Users can insert own code_executions" ON public.code_executions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Collab rooms (match backend expectations)
CREATE POLICY "Anyone can view collab_rooms" ON public.collab_rooms FOR SELECT USING (true);
CREATE POLICY "Auth users can create collab_rooms" ON public.collab_rooms FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators can update collab_rooms" ON public.collab_rooms FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Creators can delete collab_rooms" ON public.collab_rooms FOR DELETE USING (auth.uid() = created_by);

CREATE POLICY "Anyone can view collab_room_members" ON public.collab_room_members FOR SELECT USING (true);
CREATE POLICY "Users can join collab_room_members" ON public.collab_room_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave collab_room_members" ON public.collab_room_members FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- REALTIME PUBLICATION
-- =============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.submission_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.organisations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.organisation_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.code_executions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_room_members;
