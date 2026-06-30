"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { MessageSquare, X, Minus, Send, Plus, Search, Users, ChevronLeft } from "lucide-react";
import type { Profile } from "@/lib/types";

interface Conversation {
  id: string;
  name: string;
  is_group: boolean;
  members: Profile[];
  last_message?: string;
  last_message_at?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: Profile;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [allMembers, setAllMembers] = useState<Profile[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [view, setView] = useState<"list" | "chat" | "new">("list");
  const [searchMembers, setSearchMembers] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: profile }, { data: members }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("profiles").select("*").order("full_name"),
      ]);
      const profileData = profile as Profile | null;
      const membersData = (members || []) as Profile[];
      if (profileData) setCurrentUser(profileData);
      setAllMembers(membersData);
      // Load conversations only after BOTH user and members are ready
      if (profileData) await loadConversationsWith(profileData, membersData);
    }
    init();
  }, []);

  // Reload conversations when a new chat_members row appears for the current user
  // (i.e. someone starts a new conversation with this user)
  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase
      .channel(`widget:memberships:${currentUser.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "chat_members",
        filter: `user_id=eq.${currentUser.id}`,
      }, () => {
        loadConversationsWith(currentUser, allMembers);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser, allMembers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeConvId) return;
    loadMessages(activeConvId);
    const channel = supabase
      .channel(`widget:chat:${activeConvId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${activeConvId}` }, payload => {
        const msg = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, {
          ...msg,
          sender: allMembers.find(m => m.id === msg.sender_id),
        }]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeConvId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && !minimized) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, minimized]);

  async function loadConversationsWith(user: Profile, members: Profile[]) {
    const { data: memberRows, error: mrErr } = await supabase
      .from("chat_members").select("conversation_id").eq("user_id", user.id);
    if (mrErr) { console.error("chat_members read error:", mrErr.message); return; }
    if (!memberRows?.length) return;
    const ids = memberRows.map(r => r.conversation_id);
    const { data: convRows } = await supabase
      .from("chat_conversations").select("*").in("id", ids).order("created_at", { ascending: false });
    if (!convRows) return;

    const convos: Conversation[] = await Promise.all(convRows.map(async c => {
      const { data: mData } = await supabase.from("chat_members").select("user_id").eq("conversation_id", c.id);
      const memberIds = (mData || []).map(m => m.user_id);
      const convMembers = members.filter(m => memberIds.includes(m.id));
      const { data: lastMsg } = await supabase.from("chat_messages")
        .select("content, created_at").eq("conversation_id", c.id)
        .order("created_at", { ascending: false }).limit(1).single();
      const displayName = c.is_group
        ? (c.name || convMembers.filter(m => m.id !== user.id).map(m => m.full_name?.split(" ")[0]).join(", "))
        : convMembers.find(m => m.id !== user.id)?.full_name || "Chat";
      return { id: c.id, name: displayName, is_group: c.is_group, members: convMembers, last_message: lastMsg?.content, last_message_at: lastMsg?.created_at };
    }));

    const sorted = convos.sort((a, b) => {
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tb - ta;
    });
    setConversations(sorted);
    if (!open) setUnreadCount(sorted.filter(c => c.last_message).length);
  }

  async function loadMessages(convId: string) {
    const { data } = await supabase.from("chat_messages").select("*").eq("conversation_id", convId).order("created_at", { ascending: true });
    setMessages((data || []).map(m => ({ ...m, sender: allMembers.find(u => u.id === m.sender_id) })) as Message[]);
    if (currentUser) {
      await supabase.from("chat_members").update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", convId).eq("user_id", currentUser.id);
    }
  }

  async function sendMessage() {
    if (!newMsg.trim() || !activeConvId || !currentUser) return;
    setSending(true);
    const content = newMsg.trim();
    setNewMsg("");
    const { data } = await supabase.from("chat_messages").insert({
      conversation_id: activeConvId, sender_id: currentUser.id, content,
    }).select().single();
    if (data) {
      setMessages(prev => [...prev, { ...data, sender: currentUser } as Message]);
      setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, last_message: content, last_message_at: data.created_at } : c));
    }
    setSending(false);
  }

  async function startConversation() {
    if (!selectedMembers.length || !currentUser) return;
    const isGroup = selectedMembers.length > 1;
    const allParticipants = [...new Set([currentUser.id, ...selectedMembers])];
    if (!isGroup) {
      const other = selectedMembers[0];
      const existing = conversations.find(c => !c.is_group && c.members.some(m => m.id === other) && c.members.some(m => m.id === currentUser.id));
      if (existing) { setActiveConvId(existing.id); setView("chat"); setSelectedMembers([]); return; }
    }
    // Generate ID client-side so we can add members before any SELECT round-trip.
    // (The chat_conversations SELECT policy requires membership, but members haven't
    //  been inserted yet when we .select() the new row — so we avoid that SELECT entirely.)
    const convId = crypto.randomUUID();
    const { error: convErr } = await supabase.from("chat_conversations").insert({
      id: convId,
      name: isGroup ? (groupName.trim() || null) : null,
      is_group: isGroup,
      created_by: currentUser.id,
    });
    if (convErr) {
      console.error("Failed to create conversation:", convErr.message);
      alert("Could not start chat: " + convErr.message);
      return;
    }
    const { error: membersErr } = await supabase.from("chat_members").insert(
      allParticipants.map(uid => ({ conversation_id: convId, user_id: uid }))
    );
    if (membersErr) {
      console.error("Failed to add members:", membersErr.message);
      alert("Chat created but members could not be added: " + membersErr.message);
      return;
    }
    const convMembers = allMembers.filter(m => allParticipants.includes(m.id));
    const displayName = isGroup
      ? (groupName.trim() || convMembers.filter(m => m.id !== currentUser.id).map(m => m.full_name?.split(" ")[0]).join(", "))
      : convMembers.find(m => m.id !== currentUser.id)?.full_name || "Chat";
    const newConv: Conversation = { id: convId, name: displayName, is_group: isGroup, members: convMembers };
    setConversations(prev => [newConv, ...prev]);
    setActiveConvId(convId);
    setView("chat");
    setSelectedMembers([]);
    setGroupName("");
  }

  function openConv(id: string) {
    setActiveConvId(id);
    setView("chat");
    setUnreadCount(0);
  }

  function toggleOpen() {
    setOpen(o => !o);
    setMinimized(false);
    if (!open) setUnreadCount(0);
  }

  const activeConv = conversations.find(c => c.id === activeConvId);
  const filteredMembers = allMembers.filter(m =>
    m.id !== currentUser?.id &&
    (m.full_name?.toLowerCase().includes(searchMembers.toLowerCase()) ||
      m.designation?.toLowerCase().includes(searchMembers.toLowerCase()))
  );

  function timeLabel(iso?: string) {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return "now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={toggleOpen}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg shadow-indigo-200 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        title="Messages"
      >
        <MessageSquare className="w-6 h-6" />
        {unreadCount > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className={`fixed bottom-24 right-6 z-50 w-[380px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden transition-all duration-200 ${minimized ? "h-14" : "h-[520px]"}`}
        >
          {/* Panel header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white shrink-0">
            {view === "chat" && (
              <button onClick={() => setView("list")} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="flex-1 font-semibold text-sm">
              {view === "chat" ? (activeConv?.name || "Chat") : view === "new" ? "New Message" : "Messages"}
            </span>
            <button onClick={() => setMinimized(m => !m)} className="p-1 hover:bg-white/20 rounded-lg transition-colors" title={minimized ? "Expand" : "Minimize"}>
              <Minus className="w-4 h-4" />
            </button>
            <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {!minimized && (
            <>
              {/* Conversation list */}
              {view === "list" && (
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                    <p className="text-xs text-slate-500">{conversations.length} conversation{conversations.length !== 1 ? "s" : ""}</p>
                    <button onClick={() => { setView("new"); setSelectedMembers([]); setSearchMembers(""); }}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                      <Plus className="w-3.5 h-3.5" /> New
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {conversations.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center px-6">
                        <MessageSquare className="w-10 h-10 mb-2 opacity-20" />
                        <p className="text-sm">No conversations yet</p>
                        <button onClick={() => setView("new")} className="mt-2 text-xs text-indigo-600 hover:underline">Start one</button>
                      </div>
                    ) : (
                      conversations.map(conv => {
                        const other = conv.members.find(m => m.id !== currentUser?.id);
                        const initial = conv.is_group ? conv.name?.charAt(0)?.toUpperCase() || "G" : other?.full_name?.charAt(0)?.toUpperCase() || "?";
                        return (
                          <button key={conv.id} onClick={() => openConv(conv.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left ${activeConvId === conv.id ? "bg-indigo-50" : ""}`}>
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${conv.is_group ? "bg-violet-100 text-violet-700" : "bg-indigo-100 text-indigo-700"}`}>
                              {conv.is_group ? <Users className="w-4 h-4" /> : initial}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-slate-900 truncate">{conv.name}</p>
                                <p className="text-[10px] text-slate-400 shrink-0 ml-1">{timeLabel(conv.last_message_at)}</p>
                              </div>
                              <p className="text-xs text-slate-400 truncate">{conv.last_message || "No messages yet"}</p>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Chat view */}
              {view === "chat" && activeConvId && (
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                    {messages.map((msg, i) => {
                      const isMine = msg.sender_id === currentUser?.id;
                      const showName = !isMine && (i === 0 || messages[i - 1].sender_id !== msg.sender_id);
                      return (
                        <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[75%] flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                            {showName && (
                              <p className="text-[10px] text-slate-400 font-medium mb-0.5 px-1">{msg.sender?.full_name || "Unknown"}</p>
                            )}
                            <div className={`px-3 py-2 rounded-2xl text-sm ${isMine ? "bg-indigo-600 text-white rounded-br-sm" : "bg-slate-100 text-slate-800 rounded-bl-sm"}`}>
                              {msg.content}
                            </div>
                            <p className="text-[10px] text-slate-300 mt-0.5 px-1">
                              {new Date(msg.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="px-3 py-2 border-t border-slate-100">
                    <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200 focus-within:border-indigo-400 focus-within:bg-white transition-colors">
                      <input
                        value={newMsg}
                        onChange={e => setNewMsg(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                        placeholder="Type a message…"
                        className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                      />
                      <button onClick={sendMessage} disabled={sending || !newMsg.trim()}
                        className="w-7 h-7 flex items-center justify-center bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0">
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* New conversation */}
              {view === "new" && (
                <div className="flex flex-col flex-1 overflow-hidden p-3 gap-2">
                  {selectedMembers.length > 1 && (
                    <input value={groupName} onChange={e => setGroupName(e.target.value)}
                      placeholder="Group name (optional)"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  )}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input value={searchMembers} onChange={e => setSearchMembers(e.target.value)} placeholder="Search team members…"
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  {selectedMembers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedMembers.map(id => {
                        const m = allMembers.find(x => x.id === id);
                        return m ? (
                          <span key={id} className="flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                            {m.full_name?.split(" ")[0]}
                            <button onClick={() => setSelectedMembers(prev => prev.filter(x => x !== id))}><X className="w-2.5 h-2.5" /></button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto space-y-0.5">
                    {filteredMembers.map(m => (
                      <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={selectedMembers.includes(m.id)}
                          onChange={() => setSelectedMembers(prev => prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                          className="accent-indigo-600 w-3.5 h-3.5" />
                        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs shrink-0">
                          {m.full_name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">{m.full_name}</p>
                          <p className="text-xs text-slate-400">{m.designation || m.department || ""}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setView("list")} className="flex-1 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200">Cancel</button>
                    <button onClick={startConversation} disabled={selectedMembers.length === 0}
                      className="flex-1 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                      {selectedMembers.length > 1 ? "Create Group" : "Start Chat"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
