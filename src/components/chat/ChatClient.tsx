"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Send, Plus, X, Users, User, Search, MessageSquare, ChevronLeft } from "lucide-react";
import type { Profile } from "@/lib/types";

interface Conversation {
  id: string;
  name: string | null;
  is_group: boolean;
  members: Profile[];
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: Profile;
}

interface Props { currentUser: Profile; allMembers: Profile[]; }

export default function ChatClient({ currentUser, allMembers }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [showMobile, setShowMobile] = useState<"list" | "chat">("list");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const activeConv = conversations.find(c => c.id === activeConvId);

  useEffect(() => { loadConversations(); }, []);

  useEffect(() => {
    if (!activeConvId) return;
    loadMessages(activeConvId);

    const channel = supabase
      .channel(`chat:${activeConvId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${activeConvId}` }, payload => {
        const msg = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        // mark sender profile
        const sender = allMembers.find(m => m.id === msg.sender_id);
        if (sender) setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, sender } : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConvId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function loadConversations() {
    const { data: memberRows } = await supabase
      .from("chat_members")
      .select("conversation_id")
      .eq("user_id", currentUser.id);

    if (!memberRows?.length) return;
    const ids = memberRows.map(r => r.conversation_id);

    const { data: convRows } = await supabase
      .from("chat_conversations")
      .select("*")
      .in("id", ids)
      .order("created_at", { ascending: false });

    if (!convRows) return;

    const convos: Conversation[] = await Promise.all(convRows.map(async (c) => {
      const { data: memberData } = await supabase
        .from("chat_members")
        .select("user_id")
        .eq("conversation_id", c.id);
      const memberIds = (memberData || []).map(m => m.user_id);
      const members = allMembers.filter(m => memberIds.includes(m.id));

      const { data: lastMsg } = await supabase
        .from("chat_messages")
        .select("content, created_at")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const displayName = c.is_group
        ? (c.name || members.map(m => m.full_name?.split(" ")[0]).join(", "))
        : members.find(m => m.id !== currentUser.id)?.full_name || "Chat";

      return {
        id: c.id,
        name: displayName,
        is_group: c.is_group,
        members,
        last_message: lastMsg?.content,
        last_message_at: lastMsg?.created_at,
      };
    }));

    setConversations(convos.sort((a, b) => {
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tb - ta;
    }));
  }

  async function loadMessages(convId: string) {
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });

    const withSenders = (data || []).map(m => ({
      ...m,
      sender: allMembers.find(u => u.id === m.sender_id),
    }));
    setMessages(withSenders as Message[]);

    // Update last_read_at
    await supabase.from("chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", convId)
      .eq("user_id", currentUser.id);
  }

  async function sendMessage() {
    if (!newMsg.trim() || !activeConvId) return;
    setSending(true);
    const content = newMsg.trim();
    setNewMsg("");
    const { data } = await supabase.from("chat_messages").insert({
      conversation_id: activeConvId,
      sender_id: currentUser.id,
      content,
    }).select().single();
    if (data) {
      setMessages(prev => [...prev, { ...data, sender: currentUser } as Message]);
      setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, last_message: content, last_message_at: data.created_at } : c));
    }
    setSending(false);
  }

  async function startConversation() {
    if (selectedMembers.length === 0) return;
    setCreating(true);
    const isGroup = selectedMembers.length > 1;
    const allParticipants = [...new Set([currentUser.id, ...selectedMembers])];

    // For 1:1 check if conversation already exists
    if (!isGroup) {
      const otherId = selectedMembers[0];
      const existing = conversations.find(c =>
        !c.is_group && c.members.some(m => m.id === otherId) && c.members.some(m => m.id === currentUser.id)
      );
      if (existing) {
        setActiveConvId(existing.id);
        setShowMobile("chat");
        setShowNewChat(false);
        setCreating(false);
        return;
      }
    }

    const { data: conv } = await supabase.from("chat_conversations").insert({
      name: isGroup ? (groupName.trim() || null) : null,
      is_group: isGroup,
      created_by: currentUser.id,
    }).select().single();

    if (!conv) { setCreating(false); return; }

    await supabase.from("chat_members").insert(
      allParticipants.map(uid => ({ conversation_id: conv.id, user_id: uid }))
    );

    const members = allMembers.filter(m => allParticipants.includes(m.id));
    const displayName = isGroup
      ? (groupName.trim() || members.filter(m => m.id !== currentUser.id).map(m => m.full_name?.split(" ")[0]).join(", "))
      : members.find(m => m.id !== currentUser.id)?.full_name || "Chat";

    const newConv: Conversation = { id: conv.id, name: displayName, is_group: isGroup, members };
    setConversations(prev => [newConv, ...prev]);
    setActiveConvId(conv.id);
    setShowMobile("chat");
    setShowNewChat(false);
    setSelectedMembers([]);
    setGroupName("");
    setCreating(false);
  }

  function openConv(id: string) {
    setActiveConvId(id);
    setShowMobile("chat");
  }

  const otherMembers = allMembers.filter(m => m.id !== currentUser.id);
  const filteredMembers = otherMembers.filter(m =>
    m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.designation?.toLowerCase().includes(search.toLowerCase()) ||
    m.department?.toLowerCase().includes(search.toLowerCase())
  );

  function timeLabel(iso?: string) {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  function formatMsgTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="flex h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">

      {/* ── Sidebar: conversation list ── */}
      <div className={`w-72 border-r border-slate-100 flex flex-col shrink-0 ${showMobile === "chat" ? "hidden lg:flex" : "flex"}`}>
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900">Messages</h2>
            <button onClick={() => setShowNewChat(true)}
              className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <div className="text-center py-12 text-slate-400 px-6">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Click + to start a chat</p>
            </div>
          )}
          {conversations.map(conv => {
            const other = conv.members.find(m => m.id !== currentUser.id);
            const initial = conv.is_group
              ? conv.name?.charAt(0)?.toUpperCase() || "G"
              : other?.full_name?.charAt(0)?.toUpperCase() || "?";
            return (
              <button key={conv.id} onClick={() => openConv(conv.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left ${activeConvId === conv.id ? "bg-indigo-50" : ""}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${conv.is_group ? "bg-violet-100 text-violet-700" : "bg-indigo-100 text-indigo-700"}`}>
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900 truncate">{conv.name}</p>
                    <p className="text-xs text-slate-400 shrink-0 ml-1">{timeLabel(conv.last_message_at)}</p>
                  </div>
                  <p className="text-xs text-slate-400 truncate">{conv.last_message || "No messages yet"}</p>
                  {!conv.is_group && other?.designation && (
                    <p className="text-[10px] text-slate-300 truncate">{other.designation}{other.department ? ` · ${other.department}` : ""}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div className={`flex-1 flex flex-col min-w-0 ${showMobile === "list" ? "hidden lg:flex" : "flex"}`}>
        {!activeConvId ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <MessageSquare className="w-14 h-14 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select a conversation or start a new one</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 bg-white">
              <button className="lg:hidden" onClick={() => setShowMobile("list")}>
                <ChevronLeft className="w-5 h-5 text-slate-500" />
              </button>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${activeConv?.is_group ? "bg-violet-100 text-violet-700" : "bg-indigo-100 text-indigo-700"}`}>
                {activeConv?.is_group ? <Users className="w-4 h-4" /> : activeConv?.name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm truncate">{activeConv?.name}</p>
                <p className="text-xs text-slate-400">
                  {activeConv?.is_group
                    ? `${activeConv.members.length} members`
                    : activeConv?.members.find(m => m.id !== currentUser.id)?.designation || ""}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.map((msg, i) => {
                const isMine = msg.sender_id === currentUser.id;
                const showName = !isMine && (i === 0 || messages[i - 1].sender_id !== msg.sender_id);
                return (
                  <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                      {showName && (
                        <p className="text-[10px] text-slate-400 font-medium mb-0.5 px-1">
                          {msg.sender?.full_name || "Unknown"}
                        </p>
                      )}
                      <div className={`px-4 py-2.5 rounded-2xl text-sm ${isMine ? "bg-indigo-600 text-white rounded-br-md" : "bg-slate-100 text-slate-800 rounded-bl-md"}`}>
                        {msg.content}
                      </div>
                      <p className="text-[10px] text-slate-300 mt-0.5 px-1">{formatMsgTime(msg.created_at)}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-slate-100 bg-white">
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200 focus-within:border-indigo-400 focus-within:bg-white transition-colors">
                <input
                  value={newMsg}
                  onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Type a message…"
                  className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
                <button onClick={sendMessage} disabled={sending || !newMsg.trim()}
                  className="w-8 h-8 flex items-center justify-center bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── New chat modal ── */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">New Conversation</h3>
              <button onClick={() => { setShowNewChat(false); setSelectedMembers([]); setSearch(""); }}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-4 space-y-3">
              {selectedMembers.length > 1 && (
                <input value={groupName} onChange={e => setGroupName(e.target.value)}
                  placeholder="Group name (optional)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team members…"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="max-h-52 overflow-y-auto space-y-1">
                {filteredMembers.map(m => (
                  <label key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={selectedMembers.includes(m.id)} onChange={() => setSelectedMembers(prev => prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                      className="accent-indigo-600 w-4 h-4" />
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm shrink-0">
                      {m.full_name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{m.full_name}</p>
                      <p className="text-xs text-slate-400">{[m.designation, m.department].filter(Boolean).join(" · ")}</p>
                    </div>
                  </label>
                ))}
              </div>
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedMembers.map(id => {
                    const m = allMembers.find(x => x.id === id);
                    return m ? (
                      <span key={id} className="flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
                        {m.full_name?.split(" ")[0]}
                        <button onClick={() => setSelectedMembers(prev => prev.filter(x => x !== id))}><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>
            <div className="flex gap-2 p-4 border-t border-slate-100">
              <button onClick={() => { setShowNewChat(false); setSelectedMembers([]); }} className="flex-1 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={startConversation} disabled={selectedMembers.length === 0 || creating}
                className="flex-1 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {creating ? "Starting…" : selectedMembers.length > 1 ? "Create Group" : "Start Chat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
