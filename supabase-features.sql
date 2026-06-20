-- ═══════════════════════════════════════════════════════
-- Feature additions: Team Tasks, Chat, Discussion Board,
-- Vendor Management, Notifications fix
-- ═══════════════════════════════════════════════════════

-- 1. Add assigned_to[] to discussions table (Team Tasks)
ALTER TABLE discussions
  ADD COLUMN IF NOT EXISTS assigned_to uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS task_type text DEFAULT 'task'; -- 'task' | 'followup'

-- 2. Direct Messages + Group Chat
CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,                          -- null for 1:1, set for group
  is_group boolean DEFAULT false,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_members (
  conversation_id uuid REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  last_read_at timestamptz DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES profiles(id),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. Discussion Board (forum-style)
CREATE TABLE IF NOT EXISTS forum_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  project_name text,
  description text,
  created_by uuid REFERENCES profiles(id),
  members uuid[] DEFAULT '{}',
  status text DEFAULT 'open',          -- 'open' | 'resolved'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES forum_threads(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id),
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Vendor Management
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text DEFAULT 'vendor',          -- 'vendor' | 'intern'
  specializations text[] DEFAULT '{}', -- array of tags
  description text,
  agreement_notes text,
  location text,
  city text,
  state text,
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Persistent notifications table (fix polling issue)
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 6. Add hierarchy fields to profiles (for admin user creation)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS locked_designation text,
  ADD COLUMN IF NOT EXISTS locked_department text,
  ADD COLUMN IF NOT EXISTS locked_reporting_manager_id uuid REFERENCES profiles(id);

-- ═══ RLS Policies ═══

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- chat: members can see conversations they belong to
CREATE POLICY "chat_conv_member_read" ON chat_conversations FOR SELECT
  USING (EXISTS (SELECT 1 FROM chat_members WHERE conversation_id = id AND user_id = auth.uid()));
CREATE POLICY "chat_conv_insert" ON chat_conversations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "chat_members_read" ON chat_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM chat_members cm WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()));
CREATE POLICY "chat_members_insert" ON chat_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "chat_members_update" ON chat_members FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "chat_messages_read" ON chat_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM chat_members WHERE conversation_id = chat_messages.conversation_id AND user_id = auth.uid()));
CREATE POLICY "chat_messages_insert" ON chat_messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- forum: all authenticated users can read; authors can update/delete
CREATE POLICY "forum_threads_read" ON forum_threads FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "forum_threads_insert" ON forum_threads FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "forum_threads_update" ON forum_threads FOR UPDATE USING (created_by = auth.uid());
CREATE POLICY "forum_posts_read" ON forum_posts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "forum_posts_insert" ON forum_posts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "forum_posts_update" ON forum_posts FOR UPDATE USING (author_id = auth.uid());
CREATE POLICY "forum_posts_delete" ON forum_posts FOR DELETE USING (author_id = auth.uid());

-- vendors: all can read; authenticated can insert/update
CREATE POLICY "vendors_read" ON vendors FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "vendors_insert" ON vendors FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "vendors_update" ON vendors FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "vendors_delete" ON vendors FOR DELETE USING (
  created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- notifications: own only
CREATE POLICY "notifs_read" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifs_insert" ON notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "notifs_update" ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notifs_delete" ON notifications FOR DELETE USING (user_id = auth.uid());

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE forum_posts;
