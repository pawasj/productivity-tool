export interface Vertical {
  id: string;
  name: string;
  color: string;
  icon: string;
  order_index: number;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: "admin" | "member";
  department?: string;
  created_at: string;
}

export interface Todo {
  id: string;
  vertical_id: string;
  user_id: string;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high";
  due_date?: string;
  completed: boolean;
  created_at: string;
  profiles?: Profile;
}

export interface Discussion {
  id: string;
  vertical_id: string;
  title: string;
  description?: string;
  with_member_id?: string;
  status: "pending" | "in_progress" | "done";
  created_by: string;
  created_at: string;
  profiles?: Profile;
  with_member?: Profile;
}

export interface Meeting {
  id: string;
  vertical_id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  google_event_id?: string;
  meet_link?: string;
  attendees: string[];
  assigned_to?: string;
  created_at: string;
}

export interface Note {
  id: string;
  vertical_id: string;
  user_id: string;
  title: string;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface TeamDiscussion {
  id: string;
  vertical_id: string;
  title: string;
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  replies?: TeamDiscussionReply[];
}

export interface TeamDiscussionReply {
  id: string;
  discussion_id: string;
  content: string;
  created_by: string;
  created_at: string;
  profiles?: Profile;
}

export interface Lead {
  id: string;
  vertical_id: string;
  company_name: string;
  contact_name: string;
  contact_email?: string;
  contact_phone?: string;
  our_poc_id?: string;
  status: "new" | "contacted" | "proposal" | "negotiation" | "won" | "lost" | "on_hold";
  deal_value?: number;
  location?: string;
  latest_update?: string;
  notes?: string;
  next_follow_up?: string;
  created_at: string;
  updated_at: string;
  our_poc?: Profile;
  vertical?: Vertical;
}
