-- CodeCollab: Initial schema with RLS and Realtime
-- Run in Supabase SQL Editor or via Supabase CLI

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Rooms: one per coding session, shareable via invite link
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL DEFAULT 'Untitled Room',
  invite_slug TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Room members: who can access the room
CREATE TABLE public.room_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Documents: one main code document per room (content synced via Realtime)
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'javascript',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Line comments: comments on specific lines
CREATE TABLE public.document_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT line_number_positive CHECK (line_number >= 1)
);

-- Chat messages in a room
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries and Realtime
CREATE INDEX idx_room_members_room_id ON public.room_members(room_id);
CREATE INDEX idx_room_members_user_id ON public.room_members(user_id);
CREATE INDEX idx_rooms_invite_slug ON public.rooms(invite_slug);
CREATE INDEX idx_documents_room_id ON public.documents(room_id);
CREATE INDEX idx_document_comments_document_id ON public.document_comments(document_id);
CREATE INDEX idx_chat_messages_room_id ON public.chat_messages(room_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(room_id, created_at);

-- Updated_at trigger for rooms
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable Realtime for tables that need live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- RLS: helper to check if user is member of a room
CREATE OR REPLACE FUNCTION public.is_room_member(room_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = room_uuid AND user_id = user_uuid
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS: enable on all tables
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Rooms: creator can do anything; members can read
CREATE POLICY "Users can view rooms they are members of"
  ON public.rooms FOR SELECT
  USING (public.is_room_member(id, auth.uid()));

CREATE POLICY "Authenticated users can create rooms"
  ON public.rooms FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Room owners can update room"
  ON public.rooms FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members
      WHERE room_id = id AND user_id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY "Room owners can delete room"
  ON public.rooms FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members
      WHERE room_id = id AND user_id = auth.uid() AND role = 'owner'
    )
  );

-- Room members: members can see other members
CREATE POLICY "Room members can view room_members"
  ON public.room_members FOR SELECT
  USING (public.is_room_member(room_id, auth.uid()));

CREATE POLICY "Room owners can insert room_members"
  ON public.room_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_members r
      WHERE r.room_id = room_id AND r.user_id = auth.uid() AND r.role = 'owner'
    )
  );

-- Joining by invite is done via RPC join_room_by_slug (SECURITY DEFINER), not direct INSERT.

-- Documents: only room members
CREATE POLICY "Room members can view documents"
  ON public.documents FOR SELECT
  USING (public.is_room_member(room_id, auth.uid()));

CREATE POLICY "Room members can insert documents"
  ON public.documents FOR INSERT
  WITH CHECK (public.is_room_member(room_id, auth.uid()));

CREATE POLICY "Room members can update documents"
  ON public.documents FOR UPDATE
  USING (public.is_room_member(room_id, auth.uid()));

CREATE POLICY "Room members can delete documents"
  ON public.documents FOR DELETE
  USING (public.is_room_member(room_id, auth.uid()));

-- Document comments: only room members
CREATE POLICY "Room members can view document_comments"
  ON public.document_comments FOR SELECT
  USING (
    public.is_room_member(
      (SELECT room_id FROM public.documents WHERE id = document_id),
      auth.uid()
    )
  );

CREATE POLICY "Room members can insert document_comments"
  ON public.document_comments FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_room_member(
      (SELECT room_id FROM public.documents WHERE id = document_id),
      auth.uid()
    )
  );

CREATE POLICY "Comment authors can update document_comments"
  ON public.document_comments FOR UPDATE
  USING (author_id = auth.uid());

CREATE POLICY "Comment authors can delete document_comments"
  ON public.document_comments FOR DELETE
  USING (author_id = auth.uid());

-- Chat messages: only room members
CREATE POLICY "Room members can view chat_messages"
  ON public.chat_messages FOR SELECT
  USING (public.is_room_member(room_id, auth.uid()));

CREATE POLICY "Room members can insert chat_messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_room_member(room_id, auth.uid()));

CREATE POLICY "Room members can delete own chat_messages"
  ON public.chat_messages FOR DELETE
  USING (user_id = auth.uid());

-- RPC: Join room by invite slug (called from frontend with auth)
CREATE OR REPLACE FUNCTION public.join_room_by_slug(slug TEXT)
RETURNS UUID AS $$
DECLARE
  r_id UUID;
BEGIN
  SELECT id INTO r_id FROM public.rooms WHERE invite_slug = slug LIMIT 1;
  IF r_id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;
  INSERT INTO public.room_members (room_id, user_id, role)
  VALUES (r_id, auth.uid(), 'member')
  ON CONFLICT (room_id, user_id) DO NOTHING;
  RETURN r_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
