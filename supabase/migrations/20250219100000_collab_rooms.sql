-- Collab rooms: real-time collaborative coding (multiple users in one room)
CREATE TABLE IF NOT EXISTS collab_rooms (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text DEFAULT '',
  language text NOT NULL DEFAULT 'python',
  code text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  creator_email text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collab_room_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id uuid REFERENCES collab_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_email text,
  user_color text,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(room_id, user_id)
);

ALTER TABLE collab_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab_room_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rooms" ON collab_rooms FOR SELECT USING (true);
CREATE POLICY "Auth users can create rooms" ON collab_rooms FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators can update rooms" ON collab_rooms FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Creators can delete rooms" ON collab_rooms FOR DELETE USING (auth.uid() = created_by);
CREATE POLICY "Anyone can view room members" ON collab_room_members FOR SELECT USING (true);
CREATE POLICY "Users can join rooms" ON collab_room_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave rooms" ON collab_room_members FOR DELETE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE collab_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE collab_room_members;
