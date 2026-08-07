"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import {
  Zap, Plus, X, Loader2, Trash2, Search, Sparkles, ThumbsUp, Archive,
  ChevronLeft, ChevronRight, Pencil, Check, Link as LinkIcon, ExternalLink,
} from "lucide-react";

const supabase = createClient();

interface JamBoard {
  id: string;
  client_name: string;
  month?: string;
  description?: string;
  link?: string;
  is_archived: boolean;
  created_by?: string;
  created_at: string;
}

interface JamNote {
  id: string;
  board_id: string;
  content: string;
  color: string;
  author_id?: string;
  author_name?: string;
  likes: string[];
  created_at: string;
}

// Post-it palette — rotated automatically, or picked by the author
const COLORS: { key: string; bg: string; ring: string; tape: string; label: string }[] = [
  { key: "yellow", bg: "bg-[#FEF3A0]", ring: "ring-[#F5DF4D]", tape: "bg-[#F5DF4D]/60", label: "Sunshine" },
  { key: "pink",   bg: "bg-[#FFD6E8]", ring: "ring-[#FF9EC7]", tape: "bg-[#FF9EC7]/60", label: "Bubblegum" },
  { key: "blue",   bg: "bg-[#CDE8FF]", ring: "ring-[#8FCBFF]", tape: "bg-[#8FCBFF]/60", label: "Sky" },
  { key: "green",  bg: "bg-[#D3F8D3]", ring: "ring-[#95E6A0]", tape: "bg-[#95E6A0]/60", label: "Mint" },
  { key: "orange", bg: "bg-[#FFE0C2]", ring: "ring-[#FFBA7A]", tape: "bg-[#FFBA7A]/60", label: "Tangerine" },
  { key: "purple", bg: "bg-[#E6D9FF]", ring: "ring-[#C0A6FF]", tape: "bg-[#C0A6FF]/60", label: "Lavender" },
];
function colorOf(key: string) { return COLORS.find(c => c.key === key) || COLORS[0]; }

// Deterministic slight tilt per note — gives the pinned-board feel
function tiltOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  const deg = ((h % 500) / 100) - 2.5; // -2.5deg .. +2.5deg
  return deg.toFixed(2);
}

// People paste "docs.google.com/..." as often as a full URL
function normaliseLink(raw: string) {
  const v = raw.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

const PROMPTS = [
  "What's the boldest idea nobody's said yet?",
  "If this brand were a person, what would they post today?",
  "What would make this go viral on a Monday?",
  "Steal like an artist — what's working elsewhere?",
  "What's the unexpected angle here?",
];

interface Props {
  userId: string;
  userName: string;
  clientNames: string[];
}

export default function JammingBoardClient({ userId, userName, clientNames }: Props) {
  const [boards, setBoards] = useState<JamBoard[]>([]);
  const [notes, setNotes] = useState<JamNote[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);

  const [showBoardForm, setShowBoardForm] = useState(false);
  const [boardForm, setBoardForm] = useState({ client_name: "", month: "", description: "", link: "" });
  // Non-null while editing an existing board — the modal doubles as the editor
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [savingBoard, setSavingBoard] = useState(false);

  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState(COLORS[0].key);
  const [posting, setPosting] = useState(false);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const railRef = useRef<HTMLDivElement>(null);
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);

  const loadBoards = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("jam_boards").select("*").order("created_at", { ascending: false });
    const list = (data || []) as JamBoard[];
    setBoards(list);
    setActiveBoardId(prev => prev || list.find(b => !b.is_archived)?.id || list[0]?.id || "");
    setLoading(false);
  }, []);

  useEffect(() => { loadBoards(); }, [loadBoards]);

  const loadNotes = useCallback(async (boardId: string) => {
    if (!boardId) { setNotes([]); return; }
    setNotesLoading(true);
    const { data } = await supabase.from("jam_notes").select("*").eq("board_id", boardId)
      .order("created_at", { ascending: false });
    setNotes((data || []) as JamNote[]);
    setNotesLoading(false);
  }, []);

  useEffect(() => { loadNotes(activeBoardId); }, [activeBoardId, loadNotes]);

  // Live updates so the team jams together in real time
  useEffect(() => {
    if (!activeBoardId) return;
    const ch = supabase
      .channel(`jam:${activeBoardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jam_notes", filter: `board_id=eq.${activeBoardId}` },
        () => loadNotes(activeBoardId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeBoardId, loadNotes]);

  function openNewBoard() {
    setEditingBoardId(null);
    setBoardForm({ client_name: "", month: "", description: "", link: "" });
    setShowBoardForm(true);
  }

  function openEditBoard(board: JamBoard) {
    setEditingBoardId(board.id);
    setBoardForm({
      client_name: board.client_name,
      month: board.month || "",
      description: board.description || "",
      link: board.link || "",
    });
    setShowBoardForm(true);
  }

  function closeBoardForm() {
    setShowBoardForm(false);
    setEditingBoardId(null);
    setBoardForm({ client_name: "", month: "", description: "", link: "" });
  }

  async function saveBoard() {
    if (!boardForm.client_name.trim()) return;
    setSavingBoard(true);
    const payload = {
      client_name: boardForm.client_name.trim(),
      month: boardForm.month || null,
      description: boardForm.description || null,
      link: normaliseLink(boardForm.link),
    };

    if (editingBoardId) {
      const { data, error } = await supabase.from("jam_boards")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editingBoardId).select().single();
      setSavingBoard(false);
      if (error) { alert(`Couldn't save board: ${error.message}`); return; }
      if (data) setBoards(prev => prev.map(b => b.id === editingBoardId ? data as JamBoard : b));
    } else {
      const { data, error } = await supabase.from("jam_boards")
        .insert({ ...payload, created_by: userId }).select().single();
      setSavingBoard(false);
      if (error) { alert(`Couldn't create board: ${error.message}`); return; }
      if (data) {
        setBoards(prev => [data as JamBoard, ...prev]);
        setActiveBoardId((data as JamBoard).id);
      }
    }
    closeBoardForm();
  }

  async function addNote() {
    if (!draft.trim() || !activeBoardId) return;
    setPosting(true);
    const { data, error } = await supabase.from("jam_notes").insert({
      board_id: activeBoardId,
      content: draft.trim(),
      color: draftColor,
      author_id: userId,
      author_name: userName,
      likes: [],
    }).select().single();
    setPosting(false);
    if (error) { alert(`Couldn't post: ${error.message}`); return; }
    if (data) setNotes(prev => [data as JamNote, ...prev]);
    setDraft("");
    // Rotate to the next colour so the wall stays colourful
    setDraftColor(COLORS[(COLORS.findIndex(c => c.key === draftColor) + 1) % COLORS.length].key);
  }

  async function toggleLike(note: JamNote) {
    const likes = note.likes || [];
    const next = likes.includes(userId) ? likes.filter(l => l !== userId) : [...likes, userId];
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, likes: next } : n));
    const { error } = await supabase.from("jam_notes").update({ likes: next }).eq("id", note.id);
    if (error) setNotes(prev => prev.map(n => n.id === note.id ? { ...n, likes } : n));
  }

  async function saveEdit(note: JamNote) {
    const text = editText.trim();
    if (!text) return;
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, content: text } : n));
    setEditingNote(null);
    await supabase.from("jam_notes").update({ content: text, updated_at: new Date().toISOString() }).eq("id", note.id);
  }

  async function removeNote(note: JamNote) {
    if (!confirm("Remove this idea from the board?")) return;
    setNotes(prev => prev.filter(n => n.id !== note.id));
    await supabase.from("jam_notes").delete().eq("id", note.id);
  }

  async function toggleArchive(board: JamBoard) {
    const next = !board.is_archived;
    setBoards(prev => prev.map(b => b.id === board.id ? { ...b, is_archived: next } : b));
    await supabase.from("jam_boards").update({ is_archived: next }).eq("id", board.id);
  }

  async function deleteBoard(board: JamBoard) {
    if (!confirm(`Delete the "${board.client_name}" board and all its ideas? This can't be undone.`)) return;
    await supabase.from("jam_boards").delete().eq("id", board.id);
    const rest = boards.filter(b => b.id !== board.id);
    setBoards(rest);
    if (activeBoardId === board.id) setActiveBoardId(rest[0]?.id || "");
  }

  function scrollRail(dir: -1 | 1) {
    railRef.current?.scrollBy({ left: dir * 260, behavior: "smooth" });
  }

  const visibleBoards = boards.filter(b => showArchived ? true : !b.is_archived);
  const activeBoard = boards.find(b => b.id === activeBoardId);
  const visibleNotes = notes.filter(n =>
    !search || n.content.toLowerCase().includes(search.toLowerCase())
    || (n.author_name || "").toLowerCase().includes(search.toLowerCase())
  );
  const contributors = Array.from(new Set(notes.map(n => n.author_name).filter(Boolean))) as string[];

  function monthLabel(m?: string) {
    if (!m) return "";
    try { return new Date(m + "-01").toLocaleDateString("en-IN", { month: "short", year: "numeric" }); }
    catch { return m; }
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-amber-50/40">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 rounded-xl flex items-center justify-center shadow-md shadow-fuchsia-200">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Jamming Board</h1>
              <p className="text-xs text-slate-400">Throw ideas on the wall — the whole team jams here</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowArchived(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${showArchived ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
              <Archive className="w-3.5 h-3.5" /> {showArchived ? "Showing archived" : "Show archived"}
            </button>
            <button onClick={openNewBoard}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl text-sm font-medium hover:opacity-90 shadow-sm">
              <Plus className="w-4 h-4" /> New Board
            </button>
          </div>
        </div>

        {/* Client rail */}
        {visibleBoards.length > 0 && (
          <div className="flex items-center gap-2 mt-4">
            <button onClick={() => scrollRail(-1)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 shrink-0 hidden sm:block">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div ref={railRef} className="flex gap-2 overflow-x-auto py-1 flex-1"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              {visibleBoards.map(b => {
                const active = b.id === activeBoardId;
                return (
                  <button key={b.id} onClick={() => setActiveBoardId(b.id)}
                    className={`group relative shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap border ${
                      active
                        ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-transparent shadow-md scale-[1.02]"
                        : "bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-700"
                    } ${b.is_archived ? "opacity-60" : ""}`}>
                    {b.client_name}
                    {b.month && <span className={`ml-1.5 text-xs ${active ? "text-white/70" : "text-slate-400"}`}>· {monthLabel(b.month)}</span>}
                    {b.is_archived && <span className={`ml-1.5 text-[10px] ${active ? "text-white/70" : "text-slate-400"}`}>(archived)</span>}
                  </button>
                );
              })}
            </div>
            <button onClick={() => scrollRail(1)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 shrink-0 hidden sm:block">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
        ) : !activeBoard ? (
          <div className="max-w-md mx-auto text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-violet-100 to-amber-100 rounded-2xl flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-violet-400" />
            </div>
            <p className="text-lg font-bold text-slate-800 mb-1">No jam sessions yet</p>
            <p className="text-sm text-slate-500 mb-5">Start a board for a client and let the team pile on ideas.</p>
            <button onClick={openNewBoard}
              className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl text-sm font-medium hover:opacity-90">
              Start the first board
            </button>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto">
            {/* Board header */}
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                  {activeBoard.client_name}
                  {activeBoard.month && (
                    <span className="text-sm font-semibold text-violet-600 bg-violet-100 px-2.5 py-1 rounded-full">
                      {monthLabel(activeBoard.month)}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {activeBoard.description || prompt}
                </p>
                {activeBoard.link && (
                  <a href={activeBoard.link} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-2.5 py-1 rounded-full transition-colors max-w-full">
                    <LinkIcon className="w-3 h-3 shrink-0" />
                    <span className="truncate">{activeBoard.link.replace(/^https?:\/\//, "")}</span>
                    <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ideas…"
                    className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 w-40" />
                </div>
                <button onClick={() => openEditBoard(activeBoard)} title="Edit board name, month or link"
                  className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => toggleArchive(activeBoard)} title={activeBoard.is_archived ? "Unarchive" : "Archive board"}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                  <Archive className="w-4 h-4" />
                </button>
                <button onClick={() => deleteBoard(activeBoard)} title="Delete board"
                  className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Stats strip */}
            <div className="flex items-center gap-3 flex-wrap mb-5 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{notes.length} idea{notes.length !== 1 ? "s" : ""}</span>
              {contributors.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="flex -space-x-1.5">
                    {contributors.slice(0, 6).map(name => (
                      <span key={name} title={name}
                        className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-white">
                        {name.charAt(0).toUpperCase()}
                      </span>
                    ))}
                  </span>
                  {contributors.length} jamming
                </span>
              )}
            </div>

            {/* Composer */}
            <div className={`${colorOf(draftColor).bg} rounded-2xl p-4 shadow-lg mb-6 border border-black/5`}>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addNote(); }}
                placeholder="Drop your idea here… (⌘/Ctrl + Enter to post)"
                rows={2}
                className="w-full bg-transparent resize-none text-slate-800 placeholder-slate-500/60 text-[15px] font-medium focus:outline-none"
              />
              <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
                <div className="flex items-center gap-1.5">
                  {COLORS.map(c => (
                    <button key={c.key} onClick={() => setDraftColor(c.key)} title={c.label}
                      className={`w-6 h-6 rounded-full ${c.bg} border border-black/10 transition-transform ${draftColor === c.key ? "ring-2 ring-offset-1 ring-slate-700 scale-110" : "hover:scale-110"}`} />
                  ))}
                </div>
                <button onClick={addNote} disabled={posting || !draft.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 shadow-sm">
                  {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Stick it on
                </button>
              </div>
            </div>

            {/* Notes wall */}
            {notesLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
            ) : visibleNotes.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Sparkles className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">{search ? "No ideas match that search" : "Blank wall. First idea sets the tone."}</p>
              </div>
            ) : (
              <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 [column-fill:_balance]">
                {visibleNotes.map(n => {
                  const c = colorOf(n.color);
                  const mine = n.author_id === userId;
                  const liked = (n.likes || []).includes(userId);
                  const isEditing = editingNote === n.id;
                  return (
                    <div key={n.id}
                      style={{ transform: `rotate(${tiltOf(n.id)}deg)` }}
                      className={`${c.bg} relative rounded-xl p-4 mb-4 break-inside-avoid shadow-md hover:shadow-xl hover:-translate-y-0.5 hover:rotate-0 transition-all duration-200 group border border-black/5`}>
                      {/* tape */}
                      <span className={`absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-4 ${c.tape} rounded-sm rotate-[-2deg] shadow-sm`} />

                      {isEditing ? (
                        <div className="pt-2">
                          <textarea autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                            rows={4}
                            className="w-full bg-white/60 rounded-lg p-2 text-[15px] text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-slate-400" />
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => setEditingNote(null)} className="flex-1 py-1.5 text-xs text-slate-600 hover:bg-black/5 rounded-lg">Cancel</button>
                            <button onClick={() => saveEdit(n)} className="flex-1 py-1.5 text-xs bg-slate-900 text-white rounded-lg font-medium flex items-center justify-center gap-1">
                              <Check className="w-3 h-3" /> Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-[15px] leading-snug text-slate-800 font-medium whitespace-pre-wrap pt-2">{n.content}</p>
                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/10">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-slate-900/10 flex items-center justify-center text-[10px] font-bold text-slate-700 shrink-0">
                                {(n.author_name || "?").charAt(0).toUpperCase()}
                              </span>
                              <span className="text-xs font-semibold text-slate-600 truncate">{n.author_name || "Someone"}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => toggleLike(n)} title={liked ? "Un-love" : "Love this"}
                                className={`flex items-center gap-1 px-1.5 py-1 rounded-lg text-xs font-semibold transition-colors ${liked ? "text-rose-600 bg-rose-500/10" : "text-slate-500 hover:bg-black/5"}`}>
                                <ThumbsUp className={`w-3 h-3 ${liked ? "fill-current" : ""}`} />
                                {(n.likes || []).length > 0 && (n.likes || []).length}
                              </button>
                              {mine && (
                                <>
                                  <button onClick={() => { setEditingNote(n.id); setEditText(n.content); }} title="Edit"
                                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button onClick={() => removeNote(n)} title="Remove"
                                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New board modal */}
      {showBoardForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-violet-600" />
                <h3 className="font-semibold text-slate-900">{editingBoardId ? "Edit Board" : "Start a Jam Board"}</h3>
              </div>
              <button onClick={closeBoardForm}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Client / Brand *</label>
                <input autoFocus list="jam-clients" value={boardForm.client_name}
                  onChange={e => setBoardForm(f => ({ ...f, client_name: e.target.value }))}
                  placeholder="Pick a client or type a new name"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                <datalist id="jam-clients">
                  {clientNames.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Month <span className="text-slate-400 font-normal">(optional)</span></label>
                <input type="month" value={boardForm.month}
                  onChange={e => setBoardForm(f => ({ ...f, month: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">What are we jamming on? <span className="text-slate-400 font-normal">(optional)</span></label>
                <input value={boardForm.description}
                  onChange={e => setBoardForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Diwali campaign — big swings only"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Link <span className="text-slate-400 font-normal">(optional)</span></label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input value={boardForm.link}
                    onChange={e => setBoardForm(f => ({ ...f, link: e.target.value }))}
                    placeholder="Brief, deck, folder or reference URL"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Anything the team should open while jamming</p>
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={closeBoardForm} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={saveBoard} disabled={savingBoard || !boardForm.client_name.trim()}
                className="flex-1 py-2.5 text-sm bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {savingBoard ? <Loader2 className="w-4 h-4 animate-spin" /> : editingBoardId ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                {savingBoard ? (editingBoardId ? "Saving…" : "Creating…") : editingBoardId ? "Save changes" : "Let's jam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
