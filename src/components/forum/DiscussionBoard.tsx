"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { MessageSquareDot, Plus, X, Users, Send, ChevronLeft, Search, Lock, CheckCircle2 } from "lucide-react";
import type { Profile } from "@/lib/types";

interface Thread {
  id: string;
  title: string;
  project_name: string | null;
  description: string | null;
  created_by: string;
  members: string[];
  status: "open" | "resolved";
  created_at: string;
  updated_at: string;
  post_count?: number;
  creator?: Profile;
}

interface Post {
  id: string;
  thread_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Profile;
}

interface Props { currentUser: Profile; allMembers: Profile[]; }

export default function DiscussionBoard({ currentUser, allMembers }: Props) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState("");
  const [posting, setPosting] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");
  // New thread form
  const [form, setForm] = useState({ title: "", project_name: "", description: "" });
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [showMobile, setShowMobile] = useState<"list" | "thread">("list");
  const postsEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => { loadThreads(); }, []);

  useEffect(() => {
    if (!activeThread) return;
    loadPosts(activeThread.id);

    const channel = supabase
      .channel(`forum:${activeThread.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "forum_posts", filter: `thread_id=eq.${activeThread.id}` }, payload => {
        const post = payload.new as Post;
        const author = allMembers.find(m => m.id === post.author_id);
        setPostsWithAuthor({ ...post, author });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeThread?.id]);

  function setPostsWithAuthor(post: Post) {
    setPosts(prev => prev.some(p => p.id === post.id) ? prev : [...prev, post]);
  }

  useEffect(() => { postsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [posts]);

  async function loadThreads() {
    const { data } = await supabase
      .from("forum_threads")
      .select("*")
      .contains("members", [currentUser.id])
      .order("updated_at", { ascending: false });

    if (!data) return;
    const withCreators = data.map(t => ({
      ...t,
      creator: allMembers.find(m => m.id === t.created_by),
    }));
    setThreads(withCreators as Thread[]);
  }

  async function loadPosts(threadId: string) {
    const { data } = await supabase
      .from("forum_posts")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    setPosts((data || []).map(p => ({ ...p, author: allMembers.find(m => m.id === p.author_id) })) as Post[]);
  }

  async function createThread() {
    if (!form.title.trim()) return;
    setCreating(true);
    const { data } = await supabase.from("forum_threads").insert({
      title: form.title.trim(),
      project_name: form.project_name.trim() || null,
      description: form.description.trim() || null,
      created_by: currentUser.id,
      members: [...new Set([currentUser.id, ...selectedMembers])],
      status: "open",
    }).select().single();

    if (data) {
      const thread = { ...data, creator: currentUser } as Thread;
      setThreads(prev => [thread, ...prev]);
      setActiveThread(thread);
      setShowMobile("thread");
    }
    setForm({ title: "", project_name: "", description: "" });
    setSelectedMembers([]);
    setCreating(false);
    setShowNew(false);
  }

  async function addPost() {
    if (!newPost.trim() || !activeThread) return;
    setPosting(true);
    const content = newPost.trim();
    setNewPost("");
    const { data } = await supabase.from("forum_posts").insert({
      thread_id: activeThread.id,
      author_id: currentUser.id,
      content,
    }).select().single();

    if (data) {
      setPosts(prev => [...prev, { ...data, author: currentUser } as Post]);
      // bump thread updated_at
      await supabase.from("forum_threads").update({ updated_at: new Date().toISOString() }).eq("id", activeThread.id);
      setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, updated_at: new Date().toISOString() } : t));
    }
    setPosting(false);
  }

  async function toggleStatus(thread: Thread) {
    const newStatus = thread.status === "open" ? "resolved" : "open";
    await supabase.from("forum_threads").update({ status: newStatus }).eq("id", thread.id);
    const updated = { ...thread, status: newStatus as "open" | "resolved" };
    setThreads(prev => prev.map(t => t.id === thread.id ? updated : t));
    if (activeThread?.id === thread.id) setActiveThread(updated);
  }

  const filtered = threads.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.project_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  const memberOptions = allMembers.filter(m =>
    m.id !== currentUser.id &&
    (m.full_name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.designation?.toLowerCase().includes(memberSearch.toLowerCase()))
  );

  return (
    <div className="flex h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">

      {/* ── Thread list ── */}
      <div className={`w-80 border-r border-slate-100 flex flex-col shrink-0 ${showMobile === "thread" ? "hidden lg:flex" : "flex"}`}>
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900">Discussion Board</h2>
            <button onClick={() => setShowNew(true)}
              className="p-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search discussions…"
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-violet-400" />
          </div>
          <div className="flex gap-1">
            {(["all", "open", "resolved"] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:bg-slate-100"}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-400 px-6">
              <MessageSquareDot className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No discussions yet</p>
              <p className="text-xs mt-1">Click + to start one</p>
            </div>
          )}
          {filtered.map(thread => (
            <button key={thread.id}
              onClick={() => { setActiveThread(thread); setShowMobile("thread"); }}
              className={`w-full text-left px-4 py-3.5 border-b border-slate-50 hover:bg-slate-50 transition-colors ${activeThread?.id === thread.id ? "bg-violet-50" : ""}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {thread.project_name && (
                      <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                        {thread.project_name}
                      </span>
                    )}
                    {thread.status === "resolved" && (
                      <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">Resolved</span>
                    )}
                  </div>
                  <p className={`text-sm font-medium mt-0.5 truncate ${thread.status === "resolved" ? "text-slate-400" : "text-slate-800"}`}>{thread.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-400">by {thread.creator?.full_name?.split(" ")[0]}</span>
                    <span className="text-[10px] text-slate-300">·</span>
                    <span className="text-[10px] text-slate-400">{timeAgo(thread.updated_at)}</span>
                    <span className="text-[10px] text-slate-300">·</span>
                    <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                      <Users className="w-2.5 h-2.5" /> {thread.members?.length || 1}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Thread detail / posts ── */}
      <div className={`flex-1 flex flex-col min-w-0 ${showMobile === "list" ? "hidden lg:flex" : "flex"}`}>
        {!activeThread ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <MessageSquareDot className="w-14 h-14 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select a discussion or start a new one</p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <button className="lg:hidden mt-1" onClick={() => setShowMobile("list")}>
                  <ChevronLeft className="w-5 h-5 text-slate-500" />
                </button>
                <div className="flex-1 min-w-0">
                  {activeThread.project_name && (
                    <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-0.5">{activeThread.project_name}</p>
                  )}
                  <h3 className="font-semibold text-slate-900">{activeThread.title}</h3>
                  {activeThread.description && (
                    <p className="text-sm text-slate-500 mt-0.5">{activeThread.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-slate-400">Started by {activeThread.creator?.full_name}</span>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Users className="w-3 h-3" />
                      {activeThread.members?.length || 1} member{(activeThread.members?.length || 1) > 1 ? "s" : ""}:&nbsp;
                      {allMembers.filter(m => activeThread.members?.includes(m.id)).map(m => m.full_name?.split(" ")[0]).join(", ")}
                    </span>
                  </div>
                </div>
                {activeThread.created_by === currentUser.id && (
                  <button
                    onClick={() => toggleStatus(activeThread)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${activeThread.status === "open" ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    {activeThread.status === "open" ? <><CheckCircle2 className="w-3.5 h-3.5" /> Mark Resolved</> : <><Lock className="w-3.5 h-3.5" /> Reopen</>}
                  </button>
                )}
              </div>
            </div>

            {/* Posts */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {posts.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-sm">No posts yet — start the discussion!</div>
              )}
              {posts.map((post, i) => {
                const isMine = post.author_id === currentUser.id;
                const showAvatar = i === 0 || posts[i - 1].author_id !== post.author_id;
                return (
                  <div key={post.id} className="flex gap-3">
                    <div className="w-7 h-7 shrink-0 mt-0.5">
                      {showAvatar && (
                        <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-semibold text-xs">
                          {post.author?.full_name?.charAt(0)?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {showAvatar && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-slate-800">{post.author?.full_name}</span>
                          {post.author?.designation && <span className="text-[10px] text-slate-400">{post.author.designation}</span>}
                          <span className="text-[10px] text-slate-300">{timeAgo(post.created_at)}</span>
                          {isMine && <span className="text-[10px] text-indigo-400">you</span>}
                        </div>
                      )}
                      <div className="bg-slate-50 rounded-xl rounded-tl-sm px-4 py-2.5 text-sm text-slate-700 leading-relaxed">
                        {post.content}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={postsEndRef} />
            </div>

            {/* Post input */}
            {activeThread.status === "open" ? (
              <div className="px-4 py-3 border-t border-slate-100 bg-white">
                <div className="flex items-end gap-2 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200 focus-within:border-violet-400 focus-within:bg-white transition-colors">
                  <textarea
                    value={newPost}
                    onChange={e => setNewPost(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addPost(); } }}
                    placeholder="Add to the discussion…"
                    rows={1}
                    className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none resize-none"
                  />
                  <button onClick={addPost} disabled={posting || !newPost.trim()}
                    className="w-8 h-8 flex items-center justify-center bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-40 transition-colors shrink-0">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-center text-xs text-slate-400">
                This discussion is resolved. Reopen it to add more posts.
              </div>
            )}
          </>
        )}
      </div>

      {/* ── New thread modal ── */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">New Discussion</h3>
              <button onClick={() => setShowNew(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Discussion Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="What is this discussion about?"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Client / Project Name</label>
                <input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
                  placeholder="e.g. Samsung Q4 Campaign"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Provide context for this discussion…" rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Add Members</label>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search members…"
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-violet-400" />
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 border border-slate-100 rounded-lg p-1">
                  {memberOptions.map(m => (
                    <label key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={selectedMembers.includes(m.id)} onChange={() => setSelectedMembers(prev => prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                        className="accent-violet-600 w-3.5 h-3.5" />
                      <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold">
                        {m.full_name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-800">{m.full_name}</p>
                        <p className="text-[10px] text-slate-400">{m.designation}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedMembers.map(id => {
                      const m = allMembers.find(x => x.id === id);
                      return m ? (
                        <span key={id} className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                          {m.full_name?.split(" ")[0]}
                          <button onClick={() => setSelectedMembers(prev => prev.filter(x => x !== id))}><X className="w-2.5 h-2.5" /></button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setShowNew(false)} className="flex-1 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={createThread} disabled={!form.title.trim() || creating}
                className="flex-1 py-2 text-sm bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">
                {creating ? "Creating…" : "Start Discussion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
