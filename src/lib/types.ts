export interface Vertical {
  id: string;
  name: string;
  color: string;
  icon: string;
  order_index: number;
  created_at: string;
}

export const ALL_MODULES = [
  "sales_pipeline",
  "distribution_hub",
  "discussions",
  "campaign_results",
  "client_details",
  "reports",
  "social_media_reports",
  "tasks",
  "salary",
  "research_hub",
  "vendor_management",
  "owned_media",
  "todos",
  "idea_dump",
  "friends_of_bcc",
  "admin_access",
] as const;

export type AppModule = typeof ALL_MODULES[number];

export const MODULE_LABELS: Record<AppModule, string> = {
  sales_pipeline: "Sales Pipeline",
  distribution_hub: "Distribution Hub",
  discussions: "Discussion Board",
  campaign_results: "Campaign Results",
  client_details: "Client Details",
  reports: "Reports",
  social_media_reports: "Social Media Reports",
  tasks: "Tasks",
  salary: "Salary & Payouts",
  research_hub: "Research Hub",
  vendor_management: "Vendor Management",
  owned_media: "Owned Media",
  todos: "To-Dos",
  idea_dump: "Idea Dump",
  friends_of_bcc: "Friends of BCC",
  admin_access: "Admin Panel",
};

// Which sidebar route maps to which module key
export const MODULE_ROUTES: Record<AppModule, string> = {
  sales_pipeline: "/dashboard/pipeline",
  distribution_hub: "/dashboard/distro",
  discussions: "/dashboard/discussions",
  campaign_results: "/dashboard/results",
  client_details: "/dashboard/clients",
  reports: "/dashboard/reports",
  social_media_reports: "/dashboard/social-reports",
  tasks: "/dashboard/tasks",
  salary: "/dashboard/salary",
  research_hub: "/dashboard/research",
  vendor_management: "/dashboard/vendors",
  owned_media: "/dashboard/owned-media",
  todos: "/dashboard/todos",
  idea_dump: "/dashboard/ideas",
  friends_of_bcc: "/dashboard/friends",
  admin_access: "/dashboard/admin",
};

// Shared content categories — used by Distribution Hub and Owned Media
export const CONTENT_CATEGORIES = [
  "Startups", "Memes", "Pop Culture", "News", "Regional", "Motivational",
  "Clips", "Community", "Politics", "Cinema / OTT", "Cricket / Sports",
  "Music", "Devotional", "Marketing", "Tech", "AI", "Sports", "Other",
] as const;

// ── Owned Media ────────────────────────────────────────────────────────────
export type OwnedMediaPlatform = "instagram" | "linkedin" | "youtube" | "website" | "reddit" | "substack";

export interface OwnedMediaProperty {
  id: string;
  name: string;
  category?: string;
  links: Partial<Record<OwnedMediaPlatform, string>>;
  metrics: Partial<Record<OwnedMediaPlatform, number>>;   // followers / subscribers / members
  metrics_updated_at?: string;
  cadence: Record<string, number>;   // e.g. { posts: 5, reels: 3, carousels: 2, articles: 1, newsletters: 1, videos: 2 } per week
  pricing: Record<string, number>;   // e.g. { post: 5000, reel: 8000, story: 2000, collab: 10000, carousel: 6000, newsletter: 15000, video: 20000 }
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: "admin" | "member";
  phone?: string;
  designation?: string;
  department?: string;
  team?: string;
  reporting_manager_id?: string;
  employee_id?: string;
  date_of_joining?: string;
  employment_type?: "full_time" | "part_time" | "contract" | "intern";
  access_levels?: AppModule[];
  created_at: string;
  google_calendar_token?: Record<string, unknown>;
  google_calendar_email?: string;
  reporting_manager?: Profile;
}

export interface EmployeeDetails {
  id: string;
  user_id: string;
  personal_email?: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  permanent_address_line1?: string;
  permanent_address_line2?: string;
  permanent_city?: string;
  permanent_state?: string;
  permanent_pincode?: string;
  permanent_country?: string;
  same_as_permanent?: boolean;
  corr_address_line1?: string;
  corr_address_line2?: string;
  corr_city?: string;
  corr_state?: string;
  corr_pincode?: string;
  corr_country?: string;
  updated_at: string;
}

export interface EmployeeBankDetails {
  id: string;
  user_id: string;
  account_holder_name?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  branch_name?: string;
  account_type?: "savings" | "current";
  upi_id?: string;
  updated_at: string;
}

export interface EmployeeDocument {
  id: string;
  user_id: string;
  doc_type: "aadhar" | "pan" | "passport" | "offer_letter" | "nda" | "relieving_letter" | "other";
  doc_label?: string;
  file_url?: string;
  file_path?: string;
  verified: boolean;
  verified_by?: string;
  verified_at?: string;
  uploaded_at: string;
}

export interface LeaveApplication {
  id: string;
  user_id: string;
  leave_type: "casual" | "sick" | "earned" | "wfh" | "half_day" | "optional";
  from_date: string;
  to_date: string;
  days: number;
  reason?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  created_at: string;
  profiles?: Profile;
  approver?: Profile;
}

export interface AttendanceLog {
  id: string;
  user_id: string;
  date: string;
  check_in?: string;
  check_out?: string;
  status: "present" | "absent" | "wfh" | "half_day" | "on_leave" | "holiday";
  notes?: string;
  updated_at: string;
}

export interface CompanyHoliday {
  id: string;
  name: string;
  date: string;
  holiday_type: "public" | "optional" | "company";
  description?: string;
  created_by?: string;
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
  with_person_name?: string;
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
  status: "draft" | "pitched" | "negotiation" | "approved" | "lost" | "completed";
  deal_value?: number;
  engagement_type?: "retainer" | "one_time";
  monthly_value?: number;
  deal_month?: string;
  approved_at?: string;
  location?: string;
  latest_update?: string;
  notes?: string;
  next_follow_up?: string;
  brief_id?: string;
  created_at: string;
  updated_at: string;
  our_poc?: Profile;
  vertical?: Vertical;
}

export interface Idea {
  id: string;
  vertical_id: string;
  user_id: string;
  content: string;
  tags?: string[];
  created_at: string;
  profiles?: Profile;
}

export interface Influencer {
  id: string;
  handle_name: string;
  channel_link?: string;
  category?: string;
  platform: string;
  followers?: number;
  rate_post?: number;
  rate_story?: number;
  rate_combo?: number;
  rate_reel?: number;
  rate_carousel?: number;
  rate_collab_post?: number;
  contact_no?: string;
  person_name?: string;
  location?: string;
  state?: string;
  notes?: string;
  is_owned?: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientBrief {
  id: string;
  brand_name: string;
  brand_poc?: string;
  budget?: number;
  engagement_type: "retainer" | "one_time";
  industry?: string;
  brief?: string;
  status: "draft" | "planning" | "approved" | "live" | "completed" | "lost";
  created_by?: string;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  media_plans?: MediaPlan[];
}

export interface MediaPlan {
  id: string;
  brief_id: string;
  total_budget?: number;
  allocated_budget?: number;
  margin_pct?: number;
  status: "draft" | "approved";
  narrative?: string;
  plan_notes?: string;
  approved_at?: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
  items?: MediaPlanItem[];
  brief?: ClientBrief;
}

export interface PlanRow {
  handle_name: string;
  platform: string;
  category: string;
  followers: string;
  deliverable_type: string;
  quantity: number;
  rate: number;
  total_cost: number;
  client_rate: number;
  client_total: number;
  contact_no?: string;
  channel_link?: string;
}

export interface ResultRow extends PlanRow {
  live_link?: string;
  format?: string;
  views?: number;
  reach?: number;
  engagement?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  fetched_at?: string;
  submitted_at?: string;
  screenshot_url?: string;
  fetch_status?: "ok" | "partial" | "unavailable";
  extra_note?: string;
}

export interface Client {
  id: string;
  lead_id?: string;
  name: string;
  office_address?: string;
  gst_number?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  engagement_type?: "one_time" | "retainer";
  amount?: number;
  monthly_value?: number;
  deliverables?: string;
  vertical_id?: string;
  vertical?: Vertical;
  status?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  vertical_id?: string;
  vertical?: Vertical;
  category: string;
  description?: string;
  amount: number;
  month: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface SocialMediaReport {
  id: string;
  client_id?: string;
  client_name: string;
  period_from: string;
  period_to: string;
  platforms: SocialPlatformData[];
  screenshots: string[];
  analysis?: string;
  report_data?: Record<string, unknown>;
  share_token?: string;
  created_by?: string;
  created_at: string;
}

export interface SocialPlatformData {
  platform: string;
  followers?: number;
  new_followers?: number;
  posts?: number;
  reach?: number;
  impressions?: number;
  engagements?: number;
  engagement_rate?: number;
  video_views?: number;
  top_post_reach?: number;
  // Extended fields extracted by AI vision
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  stories_views?: number;
  profile_visits?: number;
  link_clicks?: number;
  top_post_description?: string;
  raw_observations?: string;
  [key: string]: unknown;
}

export interface MediaPlanItem {
  id: string;
  plan_id: string;
  influencer_id?: string;
  handle_name?: string;
  category?: string;
  platform?: string;
  followers?: number;
  deliverable_type?: string;
  quantity: number;
  rate?: number;
  total_cost?: number;
  notes?: string;
  live_link?: string;
  live_at?: string;
  created_at: string;
  influencer?: Influencer;
}
