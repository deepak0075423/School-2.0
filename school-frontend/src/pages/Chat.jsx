import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import * as chatApi from '../api/chat.api';
import { useAuth } from '../contexts/AuthContext';
import { Spinner, Modal, Button, Confirm, Badge } from '../components/ui/index';
import { connectSocket, getSocket } from '../socket';
import { useChatNotify } from '../contexts/ChatNotifyContext';
import '../styles/chat.css';

// Stable avatar hue from a name
function avatarHue(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

// "Today" / "Yesterday" / weekday / full date for day separators
function dayLabel(d) {
  const dt = new Date(d);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (dt.toDateString() === today.toDateString()) return 'Today';
  if (dt.toDateString() === y.toDateString())     return 'Yesterday';
  const days = (today - dt) / 86400000;
  if (days < 7) return dt.toLocaleDateString('en-IN', { weekday: 'long' });
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Presence: online if seen within the last ~60 seconds
const ONLINE_WINDOW = 60 * 1000;
const isOnline = (lastSeenAt) => !!lastSeenAt && (Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW);
function lastSeenLabel(lastSeenAt) {
  if (!lastSeenAt) return 'offline';
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  if (diff < ONLINE_WINDOW) return 'online';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `last seen ${mins || 1} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `last seen ${hrs} hr ago`;
  return `last seen ${new Date(lastSeenAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}

// ── Clean line icons (Feather/Lucide style) ──────────────────────────────────
const ICONS = {
  search:  <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  edit:    <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
  users:   <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  info:    <><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
  bell:    <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
  bellOff: <><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.9 17.9 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></>,
  archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
  smile:   <><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></>,
  send:    <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
  reply:   <><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></>,
  forward: <><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></>,
  trash:   <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
  more:    <><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>,
  eye:     <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
  back:    <><polyline points="15 18 9 12 15 6"/></>,
  close:   <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  clock:   <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  check:   <><polyline points="20 6 9 17 4 12"/></>,
  checks:  <><path d="M1.5 12.5 5 16l6.5-8"/><path d="M9 16l1 1 8.5-11"/></>,
};
function Ic({ name, size = 20, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
      {ICONS[name]}
    </svg>
  );
}


const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
// Broader set for the composer picker
const PICKER_EMOJIS = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😍','🥰','😘',
  '😋','😜','🤪','😎','🤩','🥳','😏','😒','😔','😞','😢','😭','😤','😠','😡','🤯',
  '😳','🥺','😱','😨','😰','😥','🤔','🤗','🤭','🙄','😴','🤤','😷','🤒','🤕','🤢',
  '👍','👎','👌','✌️','🤞','🤝','👏','🙌','🙏','💪','🫶','👋','🖐️','✋','👀','🧠',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💖','💯','🔥','✨','🎉',
  '🎊','🥳','🎁','🏆','⭐','🌟','💡','✅','❌','⚠️','❓','❗','📚','📝','🕐','☕',
];

const API_ROOT = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
const fileHref = (u) => (!u ? '#' : u.startsWith('http') ? u : `${API_ROOT}${u.startsWith('/') ? '' : '/'}${u}`);

// True when the text is just 1–3 emojis (renders large, like WhatsApp)
const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*){1,3}$/u;
const isEmojiOnly = (text) => {
  const t = String(text || '').replace(/\s/g, '');
  return t.length > 0 && t.length <= 24 && EMOJI_ONLY_RE.test(t);
};

function fmtTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  const now = new Date();
  if (dt.toDateString() === now.toDateString()) {
    return dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function ChatAvatar({ name, size = 44, type, image, online }) {
  const isGroup = type === 'group' || type === 'broadcast';
  const initials = isGroup
    ? (type === 'broadcast' ? '📢' : '👥')
    : (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const bg = isGroup
    ? 'var(--primary)'
    : `hsl(${avatarHue(name || '')}, 55%, 50%)`;
  return (
    <div className="chat-av" style={{ width: size, height: size }}>
      <div className="chat-av__img" style={{ width: size, height: size, background: bg, fontSize: size * 0.4 }}>
        {image ? <img src={image} alt="" /> : initials}
      </div>
      {online && <span className="chat-av__dot" />}
    </div>
  );
}

function Attachment({ att }) {
  if (!att) return null;
  const isImage = /^image\//.test(att.fileType || '');
  if (isImage) {
    return (
      <a href={fileHref(att.fileUrl)} target="_blank" rel="noreferrer">
        <img src={fileHref(att.fileUrl)} alt={att.originalName}
          style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, display: 'block', marginBottom: 4 }} />
      </a>
    );
  }
  return (
    <a href={fileHref(att.fileUrl)} target="_blank" rel="noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, textDecoration: 'none' }}>
      <span style={{ fontSize: '1.2rem' }}>📎</span>
      <span style={{ fontSize: '.85rem', textDecoration: 'underline', wordBreak: 'break-all' }}>
        {att.originalName || 'Attachment'}
      </span>
    </a>
  );
}

export default function Chat() {
  const { user } = useAuth();
  const { refresh: refreshBadge } = useChatNotify();
  const myId = String(user?._id || '');
  const canCreateGroup = ['school_admin', 'teacher'].includes(user?.role);
  const isSchoolAdmin  = user?.role === 'school_admin';

  const [chats, setChats]               = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [activeChat, setActiveChat]     = useState(null);
  const [messages, setMessages]         = useState([]);
  const [msgsLoading, setMsgsLoading]   = useState(false);
  const [hasMore, setHasMore]           = useState(false);
  const [text, setText]                 = useState('');
  const [sending, setSending]           = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showEmoji, setShowEmoji]       = useState(false);

  // message interaction state
  const [replyTo, setReplyTo]     = useState(null);
  const [editingMsg, setEditing]  = useState(null);
  const [editText, setEditText]   = useState('');
  const [delMsg, setDelMsg]       = useState(null);
  const [menuFor, setMenuFor]     = useState(null);   // message id whose action menu is open
  const [hoverMsg, setHoverMsg]   = useState(null);   // message id under the cursor
  const [, setNowTick]            = useState(0);       // forces presence re-eval
  const [forwardMsg, setForwardMsg] = useState(null); // message being forwarded
  const [historyMsg, setHistoryMsg] = useState(null); // admin: view edit history

  // modals
  const [showNewChat, setShowNewChat]   = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showInfo, setShowInfo]         = useState(false);
  const [showSearch, setShowSearch]     = useState(false);
  const [showOversight, setShowOversight] = useState(false);

  // contacts
  const [contacts, setContacts]               = useState([]);
  const [contactQ, setContactQ]               = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);

  // group creation
  const [groupForm, setGroupForm] = useState({ name: '', description: '', type: 'group', isReadOnly: false });
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupSaving, setGroupSaving]   = useState(false);

  // group info
  const [members, setMembers]         = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [groupEdit, setGroupEdit]     = useState(null);

  // search
  const [searchQ, setSearchQ]           = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // oversight (school_admin)
  const [ovUsers, setOvUsers]     = useState([]);
  const [ovUserQ, setOvUserQ]     = useState('');
  const [ovUser, setOvUser]       = useState(null);
  const [ovChats, setOvChats]     = useState([]);
  const [ovLoading, setOvLoading] = useState(false);

  // typing / presence
  const [typingUsers, setTypingUsers] = useState({});   // chatId → Set(userId)
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const typingTimeoutRef = useRef(null);

  const bottomRef     = useRef(null);
  const listRef       = useRef(null);
  const inputRef      = useRef(null);
  const activeChatRef = useRef(null);
  activeChatRef.current = activeChat;

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadChats = useCallback(async () => {
    try {
      const res = await chatApi.getChats();
      const list = res?.data || [];
      setChats(list);
      // Keep the open conversation's presence / mute / archive fresh
      setActiveChat(ac => {
        if (!ac || ac.observer) return ac;
        const fresh = list.find(c => c._id === ac._id);
        return fresh ? { ...ac, otherUser: fresh.otherUser, otherReadAt: fresh.otherReadAt, isMuted: fresh.isMuted, isArchived: fresh.isArchived } : ac;
      });
    } catch { /* silent */ }
    finally { setChatsLoading(false); }
  }, []);

  useEffect(() => { loadChats(); }, [loadChats]);

  const loadMessages = useCallback(async (chatId, silent = false) => {
    if (!chatId) return;
    if (!silent) setMsgsLoading(true);
    try {
      const res = await chatApi.getMessages(chatId);
      const server = res?.data || [];
      setMessages(prev => {
        // Preserve optimistic messages that haven't been persisted yet
        const pendings = prev.filter(m => m.pending && !server.some(s => s._id === m._id));
        return [...server, ...pendings];
      });
      setHasMore(!!res?.hasMore);
    } catch { /* silent */ }
    finally { if (!silent) setMsgsLoading(false); }
  }, []);

  const loadOlder = async () => {
    if (!activeChat || !messages.length) return;
    try {
      const res = await chatApi.getMessages(activeChat._id, { before: messages[0].createdAt });
      const older = res?.data || [];
      setMessages(m => [...older, ...m]);
      setHasMore(!!res?.hasMore);
    } catch { /* silent */ }
  };

  // ── Open a chat ───────────────────────────────────────────────────────────
  const openChat = useCallback((chat) => {
    setActiveChat(chat);
    setReplyTo(null); setEditing(null); setMenuFor(null); setShowEmoji(false);
    setChats(cs => cs.map(c => c._id === chat._id ? { ...c, unreadCount: 0 } : c));
    const sock = getSocket();
    if (sock?.connected) sock.emit('chat:read', { chatId: chat._id });
    setTimeout(() => refreshBadge(), 400);   // reflect read in the sidebar badge
  }, [refreshBadge]);

  // Active conversation: fetch on open, then poll every 3s so messages arrive
  // without a reload even when the websocket gateway isn't delivering.
  useEffect(() => {
    if (!activeChat) return;
    loadMessages(activeChat._id);
    const t = setInterval(() => {
      if (activeChatRef.current?._id && !document.hidden) {
        loadMessages(activeChatRef.current._id, true);
        const sock = getSocket();
        if (sock?.connected) sock.emit('chat:read', { chatId: activeChatRef.current._id });
      }
    }, 3000);
    return () => clearInterval(t);
  }, [activeChat?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chat list refresh + presence clock
  useEffect(() => {
    const list = setInterval(() => { if (!document.hidden) loadChats(); }, 5000);
    const tick = setInterval(() => setNowTick(n => n + 1), 20000);
    return () => { clearInterval(list); clearInterval(tick); };
  }, [loadChats]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // ── Socket wiring ─────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    const sock = token ? connectSocket(token) : getSocket();
    if (!sock) return;

    const onMessage = (msg) => {
      const chatId = String(msg.chat);
      if (activeChatRef.current && String(activeChatRef.current._id) === chatId) {
        setMessages(m => {
          if (msg.tempId && m.some(x => x._id === msg.tempId)) {
            return m.map(x => (x._id === msg.tempId ? msg : x));
          }
          if (m.some(x => String(x._id) === String(msg._id))) return m;
          return [...m, msg];
        });
        if (String(msg.sender?._id || msg.sender) !== myId) {
          sock.emit('chat:read', { chatId, messageId: msg._id });
        }
      }
      loadChats();
    };

    const onEdited = ({ messageId, content, editedAt, previousContent }) => {
      setMessages(m => m.map(x => {
        if (String(x._id) !== String(messageId)) return x;
        // Admins keep the audit trail: append the version being replaced
        const editHistory = isSchoolAdmin
          ? [...(x.editHistory || []), { content: previousContent ?? x.content, editedAt }]
          : x.editHistory;
        return { ...x, content, isEdited: true, editedAt, editHistory };
      }));
    };
    const onDeleted = ({ messageId }) => {
      setMessages(m => m.map(x => String(x._id) === String(messageId)
        ? { ...x, isDeleted: true } : x));
    };
    const onReaction = ({ messageId, reactions }) => {
      setMessages(m => m.map(x => String(x._id) === String(messageId) ? { ...x, reactions } : x));
    };
    const onTyping = ({ chatId, userId }) => {
      if (String(userId) === myId) return;
      setTypingUsers(tu => ({ ...tu, [chatId]: [...new Set([...(tu[chatId] || []), String(userId)])] }));
    };
    const onStopTyping = ({ chatId, userId }) => {
      setTypingUsers(tu => ({ ...tu, [chatId]: (tu[chatId] || []).filter(id => id !== String(userId)) }));
    };
    const onOnline  = ({ userId }) => setOnlineUsers(s => new Set([...s, String(userId)]));
    const onOffline = ({ userId }) => setOnlineUsers(s => { const n = new Set(s); n.delete(String(userId)); return n; });
    const onMembership = () => loadChats();
    const onError = ({ message }) => toast.error(message || 'Chat error');

    sock.on('chat:message',          onMessage);
    sock.on('chat:message_edited',   onEdited);
    sock.on('chat:message_deleted',  onDeleted);
    sock.on('chat:reaction',         onReaction);
    sock.on('chat:typing',           onTyping);
    sock.on('chat:stop_typing',      onStopTyping);
    sock.on('chat:user_online',      onOnline);
    sock.on('chat:user_offline',     onOffline);
    sock.on('chat:group_created',    onMembership);
    sock.on('chat:member_added',     onMembership);
    sock.on('chat:member_removed',   onMembership);
    sock.on('chat:group_updated',    onMembership);
    sock.on('chat:error',            onError);

    return () => {
      sock.off('chat:message',         onMessage);
      sock.off('chat:message_edited',  onEdited);
      sock.off('chat:message_deleted', onDeleted);
      sock.off('chat:reaction',        onReaction);
      sock.off('chat:typing',          onTyping);
      sock.off('chat:stop_typing',     onStopTyping);
      sock.off('chat:user_online',     onOnline);
      sock.off('chat:user_offline',    onOffline);
      sock.off('chat:group_created',   onMembership);
      sock.off('chat:member_added',    onMembership);
      sock.off('chat:member_removed',  onMembership);
      sock.off('chat:group_updated',   onMembership);
      sock.off('chat:error',           onError);
    };
  }, [myId, loadChats]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Typing emitter ────────────────────────────────────────────────────────
  const emitTyping = () => {
    const sock = getSocket();
    if (!sock?.connected || !activeChat) return;
    sock.emit('chat:typing', { chatId: activeChat._id });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sock.emit('chat:stop_typing', { chatId: activeChat._id });
    }, 2000);
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const doSend = async (payload) => {
    const tempId = `tmp-${Date.now()}`;
    const optimistic = {
      _id: tempId, chat: activeChat._id, sender: { _id: myId, name: user?.name },
      content: payload.content || '', type: payload.type || 'text',
      attachments: payload.attachments || [], replyTo: replyTo || null,
      createdAt: new Date().toISOString(), pending: true,
    };
    setMessages(m => [...m, optimistic]);
    try {
      const res = await chatApi.sendMessage(activeChat._id, { ...payload, replyTo: replyTo?._id || null, tempId });
      setMessages(m => m.map(x => (x._id === tempId ? res.data : x)));
      setReplyTo(null);
      loadChats();
    } catch (err) {
      setMessages(m => m.filter(x => x._id !== tempId));
      toast.error(err?.message || 'Failed to send');
    }
  };

  // Insert an emoji at the caret (or append) and keep focus in the input
  const insertEmoji = (emoji) => {
    const el = inputRef.current;
    if (el && typeof el.selectionStart === 'number') {
      const start = el.selectionStart, end = el.selectionEnd;
      setText(t => t.slice(0, start) + emoji + t.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + emoji.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      setText(t => t + emoji);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !activeChat || sending) return;
    setSending(true);
    const content = text.trim();
    setText('');
    await doSend({ content });
    setSending(false);
  };

  // ── Message actions ───────────────────────────────────────────────────────
  const startEdit = (msg) => { setEditing(msg); setEditText(msg.content); setMenuFor(null); };

  const saveEdit = async () => {
    if (!editText.trim()) return;
    try {
      await chatApi.editMessage(editingMsg._id, editText.trim());
      setMessages(m => m.map(x => x._id === editingMsg._id
        ? { ...x, content: editText.trim(), isEdited: true } : x));
      setEditing(null);
    } catch (err) { toast.error(err?.message || 'Failed to edit'); }
  };

  const confirmDelete = async () => {
    try {
      await chatApi.deleteMessage(delMsg._id);
      setMessages(m => m.map(x => x._id === delMsg._id ? { ...x, isDeleted: true } : x));
      setDelMsg(null);
    } catch (err) { toast.error(err?.message || 'Failed to delete'); }
  };

  const react = async (msg, emoji) => {
    setMenuFor(null);
    try {
      const res = await chatApi.toggleReaction(msg._id, emoji);
      setMessages(m => m.map(x => x._id === msg._id ? { ...x, reactions: res.data } : x));
    } catch (err) { toast.error(err?.message || 'Failed'); }
  };

  // ── Forward a message to another chat ──────────────────────────────────────
  const doForward = async (targetChat) => {
    if (!forwardMsg || !targetChat) return;
    try {
      await chatApi.sendMessage(targetChat._id, {
        content: forwardMsg.content, type: forwardMsg.type || 'text', isForwarded: true,
      });
      toast.success(`Forwarded to ${chatName(targetChat)}`);
      setForwardMsg(null);
      if (activeChat?._id === targetChat._id) loadMessages(targetChat._id, true);
      loadChats();
    } catch (err) { toast.error(err?.message || 'Failed to forward'); }
  };

  // ── Contacts / new chat / new group ───────────────────────────────────────
  const loadContacts = async (q = '') => {
    setContactsLoading(true);
    try {
      const res = await chatApi.getContacts({ q: q || undefined });
      setContacts(res?.data || []);
    } catch { /* silent */ }
    finally { setContactsLoading(false); }
  };

  useEffect(() => {
    if (showNewChat || showNewGroup) loadContacts(contactQ);
  }, [showNewChat, showNewGroup, contactQ]);

  const handleStartChat = async (targetUserId) => {
    try {
      const res = await chatApi.startDirectChat(targetUserId);
      setShowNewChat(false);
      await loadChats();
      const fresh = await chatApi.getChats();
      setChats(fresh?.data || []);
      const found = (fresh?.data || []).find(c => String(c._id) === String(res.data._id));
      openChat(found || res.data);
    } catch (err) {
      toast.error(err?.message || 'Cannot start chat');
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupForm.name.trim()) return toast.error('Group name required');
    setGroupSaving(true);
    try {
      const res = await chatApi.createGroup({ ...groupForm, memberIds: groupMembers });
      toast.success('Group created');
      setShowNewGroup(false);
      setGroupForm({ name: '', description: '', type: 'group', isReadOnly: false });
      setGroupMembers([]);
      await loadChats();
      const fresh = await chatApi.getChats();
      const found = (fresh?.data || []).find(c => String(c._id) === String(res.data._id));
      if (found) openChat(found);
    } catch (err) { toast.error(err?.message || 'Failed to create group'); }
    finally { setGroupSaving(false); }
  };

  // ── Group info ────────────────────────────────────────────────────────────
  const openInfo = async () => {
    setShowInfo(true);
    setMembersLoading(true);
    setGroupEdit(null);
    try {
      const res = await chatApi.getChatMembers(activeChat._id);
      setMembers(res?.data || []);
    } catch { /* silent */ }
    finally { setMembersLoading(false); }
  };

  const iAmGroupAdmin = useMemo(
    () => members.some(m => String(m.user?._id) === myId && m.role === 'admin'),
    [members, myId]
  );

  const handleAddMember = async (memberId) => {
    try {
      await chatApi.addMember(activeChat._id, memberId);
      toast.success('Member added');
      const res = await chatApi.getChatMembers(activeChat._id);
      setMembers(res?.data || []);
      setAddingMember(false);
    } catch (err) { toast.error(err?.message || 'Failed'); }
  };

  const handleRemoveMember = async (memberId) => {
    try {
      await chatApi.removeMember(activeChat._id, memberId);
      setMembers(ms => ms.filter(m => String(m.user?._id) !== String(memberId)));
      if (String(memberId) === myId) { setShowInfo(false); setActiveChat(null); loadChats(); }
    } catch (err) { toast.error(err?.message || 'Failed'); }
  };

  const saveGroupSettings = async () => {
    try {
      await chatApi.updateGroupSettings(activeChat._id, groupEdit);
      toast.success('Group updated');
      setActiveChat(c => ({ ...c, ...groupEdit, displayName: groupEdit.name }));
      setGroupEdit(null);
      loadChats();
    } catch (err) { toast.error(err?.message || 'Failed'); }
  };

  const handleMute = async () => {
    try {
      const res = await chatApi.toggleMute(activeChat._id);
      setActiveChat(c => ({ ...c, isMuted: res.data.isMuted }));
      loadChats();
    } catch (err) { toast.error(err?.message || 'Failed'); }
  };

  const handleArchive = async () => {
    try {
      const res = await chatApi.toggleArchive(activeChat._id);
      setActiveChat(c => ({ ...c, isArchived: res.data.isArchived }));
      loadChats();
    } catch (err) { toast.error(err?.message || 'Failed'); }
  };

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showSearch || searchQ.trim().length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await chatApi.searchMessages({ q: searchQ.trim() });
        setSearchResults(res?.data || []);
      } catch { /* silent */ }
      finally { setSearchLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [searchQ, showSearch]);

  // ── Oversight (school_admin) ──────────────────────────────────────────────
  useEffect(() => {
    if (!showOversight) return;
    const t = setTimeout(async () => {
      try {
        const res = await chatApi.getSchoolUsers({ q: ovUserQ || undefined });
        setOvUsers(res?.data || []);
      } catch { /* silent */ }
    }, 300);
    return () => clearTimeout(t);
  }, [showOversight, ovUserQ]);

  const openOvUser = async (u) => {
    setOvUser(u); setOvLoading(true); setOvChats([]);
    try {
      const res = await chatApi.getAdminUserChats(u._id);
      setOvChats(res?.data?.chats || []);
    } catch (err) { toast.error(err?.message || 'Failed'); }
    finally { setOvLoading(false); }
  };

  const openOvChat = async (chat) => {
    setShowOversight(false);
    setActiveChat({ ...chat, observer: true });
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const chatName = (chat) => {
    if (!chat) return '';
    return chat.displayName || chat.name || (chat.type === 'direct' ? 'Direct Chat' : 'Group');
  };

  const visibleChats = chats.filter(c => (showArchived ? c.isArchived : !c.isArchived));
  const activeTyping = (typingUsers[activeChat?._id] || []).length > 0;
  // Presence for the open direct chat: socket event OR recent lastSeenAt heartbeat
  const otherLastSeen = activeChat?.type === 'direct' ? activeChat?.otherUser?.lastSeenAt : null;
  const otherOnline   = activeChat?.type === 'direct' && activeChat?.otherUser &&
                        (onlineUsers.has(String(activeChat.otherUser._id)) || isOnline(otherLastSeen));
  const headerSubtitle = activeTyping ? 'typing…'
    : activeChat?.type === 'direct'
      ? (otherOnline ? 'online' : lastSeenLabel(otherLastSeen))
      : (activeChat ? `${activeChat.type} chat` : '');

  const memberNameById = useMemo(() => {
    const map = {};
    members.forEach(m => { if (m.user) map[String(m.user._id)] = m.user.name; });
    return map;
  }, [members]);

  const isGroupChat = activeChat && (activeChat.type === 'group' || activeChat.type === 'broadcast');
  const isDirect    = activeChat?.type === 'direct';

  // Group consecutive messages by sender + day into WhatsApp/Slack-style clusters,
  // inserting a day separator when the date changes.
  const renderItems = useMemo(() => {
    const items = [];
    let lastDay = null;
    let group = null;
    for (const msg of messages) {
      const day = new Date(msg.createdAt).toDateString();
      const senderId = String(msg.sender?._id || msg.sender);
      const mine = senderId === myId;
      if (day !== lastDay) {
        items.push({ type: 'day', key: `day-${day}`, label: dayLabel(msg.createdAt) });
        lastDay = day;
        group = null;
      }
      const gap = group && (new Date(msg.createdAt) - new Date(group.lastAt)) > 5 * 60 * 1000;
      if (!group || group.senderId !== senderId || gap) {
        group = { type: 'group', key: `grp-${msg._id}`, senderId, mine, sender: msg.sender, msgs: [], lastAt: msg.createdAt };
        items.push(group);
      }
      group.msgs.push(msg);
      group.lastAt = msg.createdAt;
    }
    return items;
  }, [messages, myId]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`chat-wrap${activeChat ? ' has-active' : ''}`}>

      {/* ───────── Sidebar ───────── */}
      <div className="chat-side">
        <div className="chat-side__head">
          <span className="chat-side__title">Chats</span>
          <div className="chat-side__actions">
            <button className={`chat-iconbtn${showSearch ? ' active' : ''}`} title="Search messages"
              onClick={() => { setShowSearch(s => !s); setSearchQ(''); }}><Ic name="search" /></button>
            {isSchoolAdmin && (
              <button className="chat-iconbtn" title="Chat oversight"
                onClick={() => { setShowOversight(true); setOvUser(null); }}><Ic name="eye" /></button>
            )}
            {canCreateGroup && (
              <button className="chat-iconbtn" title="New group"
                onClick={() => setShowNewGroup(true)}><Ic name="users" /></button>
            )}
            <button className="chat-iconbtn chat-iconbtn--primary" title="New chat"
              onClick={() => setShowNewChat(true)}><Ic name="edit" /></button>
          </div>
        </div>

        {showSearch && (
          <div className="chat-search">
            <input placeholder="Search messages…" autoFocus
              value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          </div>
        )}

        <div ref={listRef} className="chat-list">
          {showSearch && searchQ.trim().length >= 2 ? (
            searchLoading ? (
              <div style={{ padding:32, display:'flex', justifyContent:'center' }}><Spinner /></div>
            ) : searchResults.length === 0 ? (
              <div className="chat-list__empty">No messages found</div>
            ) : searchResults.map(msg => (
              <div key={msg._id} className="chat-row"
                onClick={() => {
                  const c = chats.find(x => String(x._id) === String(msg.chat?._id || msg.chat));
                  if (c) { setShowSearch(false); openChat(c); }
                }}>
                <ChatAvatar name={msg.sender?.name} size={44} />
                <div className="chat-row__body">
                  <div className="chat-row__top">
                    <span className="chat-row__name">{msg.sender?.name}</span>
                    <span className="chat-row__time">{fmtTime(msg.createdAt)}</span>
                  </div>
                  <div className="chat-row__preview">{msg.content}</div>
                </div>
              </div>
            ))
          ) : chatsLoading ? (
            <div style={{ padding:32, display:'flex', justifyContent:'center' }}><Spinner /></div>
          ) : visibleChats.length === 0 ? (
            <div className="chat-list__empty">
              {showArchived ? 'No archived chats.' : <>No conversations yet.<br />Tap the compose button to start one.</>}
            </div>
          ) : visibleChats.map(chat => {
            const online = chat.type === 'direct' && chat.otherUser &&
              (onlineUsers.has(String(chat.otherUser._id)) || isOnline(chat.otherUser.lastSeenAt));
            return (
              <div key={chat._id} className={`chat-row${activeChat?._id === chat._id ? ' active' : ''}${chat.unreadCount > 0 ? ' unread' : ''}`}
                onClick={() => openChat(chat)}>
                <ChatAvatar name={chatName(chat)} type={chat.type} image={chat.displayAvatar} online={online} size={46} />
                <div className="chat-row__body">
                  <div className="chat-row__top">
                    <span className="chat-row__name" style={{ display:'flex', alignItems:'center', gap:5 }}>
                      {chat.isMuted && <Ic name="bellOff" size={13} style={{ opacity:.6, flexShrink:0 }} />}
                      {chatName(chat)}
                    </span>
                    <span className="chat-row__time">{fmtTime(chat.lastActivity)}</span>
                  </div>
                  <div className="chat-row__top">
                    <span className="chat-row__preview">
                      {chat.lastMessage?.isDeleted ? 'Message deleted'
                        : chat.lastMessage?.type === 'image' ? '📷 Photo'
                        : chat.lastMessage?.type === 'file'  ? '📎 File'
                        : chat.lastMessage?.content || 'No messages yet'}
                    </span>
                    {chat.unreadCount > 0 && <span className="chat-pill">{chat.unreadCount}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="chat-side__foot">
          <button onClick={() => setShowArchived(a => !a)}>
            {showArchived ? '← Back to chats' : `Archived (${chats.filter(c => c.isArchived).length})`}
          </button>
        </div>
      </div>

      {/* ───────── Main pane ───────── */}
      <div className="chat-main">
        {!activeChat ? (
          <div className="chat-empty">
            <div className="chat-empty__icon">💬</div>
            <div style={{ fontWeight:600, fontSize:'1.05rem', color:'var(--text)' }}>Your messages</div>
            <div>Select a conversation or start a new one.</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="chat-header">
              <button className="chat-iconbtn chat-back" title="Back"
                onClick={() => setActiveChat(null)}><Ic name="back" /></button>
              <ChatAvatar name={chatName(activeChat)} type={activeChat.type} image={activeChat.displayAvatar} online={otherOnline} size={42} />
              <div className="chat-header__meta">
                <div className="chat-header__title">
                  {chatName(activeChat)}
                  {activeChat.observer && <Badge variant="warning">observer</Badge>}
                  {activeChat.isReadOnly && <Badge variant="muted">read-only</Badge>}
                </div>
                <div className={`chat-header__sub${activeTyping ? ' typing' : otherOnline ? ' online' : ''}`}>
                  {headerSubtitle}
                </div>
              </div>
              {!activeChat.observer && (
                <div className="chat-header__actions">
                  {(activeChat.type === 'group' || activeChat.type === 'broadcast') && (
                    <button className="chat-iconbtn" onClick={openInfo} title="Group info"><Ic name="info" /></button>
                  )}
                  <button className="chat-iconbtn" onClick={handleMute} title={activeChat.isMuted ? 'Unmute' : 'Mute'}>
                    <Ic name={activeChat.isMuted ? 'bellOff' : 'bell'} />
                  </button>
                  <button className="chat-iconbtn" onClick={handleArchive} title={activeChat.isArchived ? 'Unarchive' : 'Archive'}><Ic name="archive" /></button>
                </div>
              )}
            </div>

            {/* Messages canvas */}
            <div className="chat-canvas">
              {msgsLoading ? (
                <div style={{ display:'flex', justifyContent:'center', padding:32 }}><Spinner /></div>
              ) : (
                <>
                  {hasMore && (
                    <div className="chat-loadmore">
                      <button onClick={loadOlder}>Load older messages</button>
                    </div>
                  )}
                  {messages.length === 0 ? (
                    <div className="chat-list__empty">No messages yet. Say hello! 👋</div>
                  ) : renderItems.map(item => {
                    if (item.type === 'day') return <div key={item.key} className="chat-day"><span>{item.label}</span></div>;
                    const g = item;
                    const showAv = !g.mine && isGroupChat;
                    return (
                      <div key={g.key} className={`chat-grp${g.mine ? ' mine' : ''}`}>
                        {showAv && <div className="chat-grp__av"><ChatAvatar name={g.sender?.name} size={34} /></div>}
                        <div className="chat-grp__col">
                          {showAv && (
                            <div className="chat-grp__sender" style={{ color:`hsl(${avatarHue(g.sender?.name||'')},55%,45%)` }}>
                              {g.sender?.name}
                              {g.sender?.role && <span style={{ opacity:.65, fontWeight:500 }}> · {String(g.sender.role).replace('_',' ')}</span>}
                            </div>
                          )}
                          {g.msgs.map(msg => {
                            const isMine = g.mine;
                            const canEdit = isMine && !msg.isDeleted && (Date.now() - new Date(msg.createdAt).getTime() < 86_400_000);
                            const canDelete = !msg.isDeleted && (isMine || isSchoolAdmin);
                            const isEditing = editingMsg?._id === msg._id;
                            const adminSeesDeleted = msg.isDeleted && isSchoolAdmin && msg.content;
                            const showBar = (hoverMsg === msg._id || menuFor === msg._id) && !msg.isDeleted && !msg.pending && !isEditing && !activeChat.observer;
                            const emojiBig = !msg.isDeleted && !isEditing && isEmojiOnly(msg.content) && !(msg.attachments || []).length;
                            const bubbleClass = emojiBig
                              ? 'chat-bubble chat-emoji-only'
                              : `chat-bubble ${isMine ? 'out' : 'in'}${msg.isDeleted && !adminSeesDeleted ? ' deleted' : ''}${msg.pending ? ' pending' : ''}`;
                            return (
                              <div key={msg._id} className="chat-brow"
                                onMouseEnter={() => setHoverMsg(msg._id)}
                                onMouseLeave={() => setHoverMsg(h => (h === msg._id ? null : h))}>
                                {showBar && (
                                  <div className="chat-hoverbar">
                                    {EMOJIS.map(e => (
                                      <span key={e} className="qr" title={`React ${e}`} onClick={() => react(msg, e)}>{e}</span>
                                    ))}
                                    <span className="divider" />
                                    <button type="button" className="morebtn" title="More"
                                      onClick={() => setMenuFor(f => f === msg._id ? null : msg._id)}><Ic name="more" size={17} /></button>
                                  </div>
                                )}
                                {menuFor === msg._id && (
                                  <>
                                    <div onClick={() => setMenuFor(null)} style={{ position:'fixed', inset:0, zIndex:11 }} />
                                    <div className="chat-menu">
                                      <button onClick={() => { setReplyTo(msg); setEditing(null); setMenuFor(null); }}><Ic name="reply" size={16} /> Reply</button>
                                      <button onClick={() => { setForwardMsg(msg); setMenuFor(null); }}><Ic name="forward" size={16} /> Forward</button>
                                      {canEdit && <button onClick={() => { startEdit(msg); setMenuFor(null); }}><Ic name="edit" size={16} /> Edit</button>}
                                      {canDelete && <button className="danger" onClick={() => { setDelMsg(msg); setMenuFor(null); }}><Ic name="trash" size={16} /> Delete</button>}
                                    </div>
                                  </>
                                )}
                                <div className={bubbleClass}>
                                  {msg.isForwarded && !msg.isDeleted && !isEditing && (
                                    <div className="chat-fwd"><Ic name="forward" size={13} /> Forwarded</div>
                                  )}
                                  {msg.replyTo && !msg.isDeleted && (
                                    <div className="chat-reply-quote">
                                      <b>{msg.replyTo.sender?.name || '…'}</b>
                                      <span>{msg.replyTo.isDeleted ? 'Deleted message' : msg.replyTo.content}</span>
                                    </div>
                                  )}
                                  {msg.isDeleted && !adminSeesDeleted ? (
                                    <span style={{ fontStyle:'italic' }}>🚫 This message was deleted</span>
                                  ) : msg.isDeleted && adminSeesDeleted ? (
                                    <div>
                                      <div style={{ fontSize:'.7rem', color:'var(--danger, #ef4444)', fontWeight:700, marginBottom:3 }}>🗑️ Deleted (admin view)</div>
                                      <div style={{ opacity:.75, textDecoration:'line-through' }}>{msg.content}</div>
                                    </div>
                                  ) : isEditing ? (
                                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                                      <input className="form-control" value={editText} autoFocus
                                        onChange={e => setEditText(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null); }}
                                        style={{ fontSize:'.85rem', color:'#111', minWidth:160 }} />
                                      <button className="btn btn-sm btn-secondary" onClick={saveEdit}>✓</button>
                                      <button className="btn btn-sm btn-secondary" onClick={() => setEditing(null)}>✕</button>
                                    </div>
                                  ) : emojiBig ? (
                                    <span className="emoji-pop">{msg.content}</span>
                                  ) : (
                                    <>
                                      {(msg.attachments || []).map((att, i) => <Attachment key={i} att={att} />)}
                                      <span className="chat-bubble__text">{msg.content}</span>
                                      <span className="chat-bubble__meta">
                                        {msg.isEdited && (
                                          isSchoolAdmin && (msg.editHistory || []).length
                                            ? <span style={{ cursor:'pointer', textDecoration:'underline' }} title="Edit history" onClick={() => setHistoryMsg(msg)}>edited</span>
                                            : <span>edited</span>
                                        )}
                                        {fmtTime(msg.createdAt)}
                                        {isMine && (() => {
                                          if (msg.pending) return <Ic name="clock" size={13} style={{ marginLeft:2 }} />;
                                          const mt = new Date(msg.createdAt).getTime();
                                          const readAt  = activeChat?.otherReadAt ? new Date(activeChat.otherReadAt).getTime() : 0;
                                          const seenAt  = activeChat?.otherUser?.lastSeenAt ? new Date(activeChat.otherUser.lastSeenAt).getTime() : 0;
                                          if (isDirect && readAt >= mt)  return <Ic name="checks" size={15} style={{ marginLeft:2 }} className="tick-read" />;
                                          if (isDirect && seenAt >= mt)  return <Ic name="checks" size={15} style={{ marginLeft:2 }} />;
                                          if (!isDirect)                 return <Ic name="checks" size={15} style={{ marginLeft:2 }} />;
                                          return <Ic name="check" size={14} style={{ marginLeft:2 }} />;
                                        })()}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {(msg.reactions || []).length > 0 && (
                                  <div className="chat-reacts">
                                    {Object.entries((msg.reactions || []).reduce((acc, r) => { acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc; }, {})).map(([emoji, count]) => (
                                      <span key={emoji} className="chat-react" onClick={() => !activeChat.observer && react(msg, emoji)}>
                                        {emoji} {count > 1 ? count : ''}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {activeTyping && (
                    <div className="chat-typing">
                      {isGroupChat && <div className="chat-grp__av" />}
                      <div className="chat-typing__bubble"><i /><i /><i /></div>
                    </div>
                  )}
                </>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Reply banner */}
            {replyTo && (
              <div className="chat-replybar">
                <div className="chat-replybar__body">
                  <b>Replying to {replyTo.sender?.name}</b>
                  <div>{replyTo.content?.slice(0, 120) || '(attachment)'}</div>
                </div>
                <button className="chat-replybar__close" onClick={() => setReplyTo(null)}><Ic name="close" size={18} /></button>
              </div>
            )}

            {/* Composer */}
            {activeChat.observer ? (
              <div className="chat-composer__notice">Observer mode — viewing as administrator.</div>
            ) : (activeChat.isReadOnly && !['school_admin', 'teacher'].includes(user?.role)) ? (
              <div className="chat-composer__notice">🔒 Only teachers and admins can send messages in this channel.</div>
            ) : (
              <form onSubmit={handleSend} className="chat-composer">
                {showEmoji && (
                  <>
                    <div onClick={() => setShowEmoji(false)} style={{ position:'fixed', inset:0, zIndex:19 }} />
                    <div className="chat-emojipick">
                      {PICKER_EMOJIS.map((em, i) => (
                        <button key={i} type="button" onClick={() => insertEmoji(em)}>{em}</button>
                      ))}
                    </div>
                  </>
                )}
                <div className="chat-inputbox">
                  <button type="button" className="chat-inputbox__emoji" title="Emoji"
                    onClick={() => setShowEmoji(s => !s)}><Ic name="smile" size={22} /></button>
                  <textarea
                    ref={inputRef}
                    rows={1}
                    placeholder="Type a message…"
                    value={text}
                    onChange={e => {
                      setText(e.target.value); emitTyping();
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                    disabled={sending}
                  />
                </div>
                <button type="submit" className="chat-sendbtn" disabled={!text.trim() || sending} title="Send">
                  {sending ? '…' : <Ic name="send" size={20} style={{ marginLeft:-1 }} />}
                </button>
              </form>
            )}
          </>
        )}
      </div>


      {/* New Direct Chat modal */}
      <Modal open={showNewChat} onClose={() => setShowNewChat(false)} title="New Direct Chat">
        <input className="form-control" placeholder="Search people…" autoFocus
          value={contactQ} onChange={e => setContactQ(e.target.value)} style={{ marginBottom: 12 }} />
        <div style={{ maxHeight: 380, overflowY:'auto' }}>
          {contactsLoading ? (
            <div style={{ padding:32, display:'flex', justifyContent:'center' }}><Spinner /></div>
          ) : contacts.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)' }}>No contacts found</div>
          ) : contacts.map(c => (
            <div key={c._id} onClick={() => handleStartChat(c._id)}
              style={{ padding:'10px 12px', cursor:'pointer', display:'flex', gap:10, alignItems:'center', borderBottom:'1px solid var(--border)', borderRadius:6 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <ChatAvatar name={c.name} size={32} />
              <div>
                <div style={{ fontWeight:600, fontSize:'.9rem' }}>{c.name}</div>
                <div style={{ fontSize:'.75rem', color:'var(--text-muted)', textTransform:'capitalize' }}>{c.role?.replace('_', ' ')}</div>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* New Group modal */}
      <Modal open={showNewGroup} onClose={() => setShowNewGroup(false)} title="Create Group"
        footer={<>
          <Button variant="secondary" onClick={() => setShowNewGroup(false)}>Cancel</Button>
          <Button form="group-form" type="submit" loading={groupSaving}>Create Group</Button>
        </>}>
        <form id="group-form" onSubmit={handleCreateGroup}>
          <div className="form-group">
            <label className="form-label required">Group Name</label>
            <input className="form-control" required value={groupForm.name}
              onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-control" value={groupForm.description}
              onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={groupForm.type}
                onChange={e => setGroupForm(f => ({ ...f, type: e.target.value }))}>
                <option value="group">Group (everyone can send)</option>
                <option value="broadcast">Broadcast (announcements)</option>
              </select>
            </div>
            <div className="form-group" style={{ display:'flex', alignItems:'flex-end' }}>
              <label style={{ display:'flex', gap:8, alignItems:'center', cursor:'pointer' }}>
                <input type="checkbox" checked={groupForm.isReadOnly}
                  onChange={e => setGroupForm(f => ({ ...f, isReadOnly: e.target.checked }))} />
                Read-only for students/parents
              </label>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Members ({groupMembers.length} selected)</label>
            <input className="form-control" placeholder="Search people…"
              value={contactQ} onChange={e => setContactQ(e.target.value)} style={{ marginBottom: 8 }} />
            <div style={{ maxHeight: 220, overflowY:'auto', border:'1px solid var(--border)', borderRadius:8 }}>
              {contactsLoading ? (
                <div style={{ padding:20, display:'flex', justifyContent:'center' }}><Spinner /></div>
              ) : contacts.map(c => {
                const checked = groupMembers.includes(String(c._id));
                return (
                  <label key={c._id} style={{ padding:'8px 12px', display:'flex', gap:10, alignItems:'center', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
                    <input type="checkbox" checked={checked}
                      onChange={() => setGroupMembers(ms => checked
                        ? ms.filter(id => id !== String(c._id))
                        : [...ms, String(c._id)])} />
                    <ChatAvatar name={c.name} size={26} />
                    <span style={{ fontSize:'.87rem' }}>{c.name}</span>
                    <span style={{ fontSize:'.72rem', color:'var(--text-muted)', textTransform:'capitalize', marginLeft:'auto' }}>{c.role?.replace('_',' ')}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </form>
      </Modal>

      {/* Group info modal */}
      <Modal open={showInfo} onClose={() => setShowInfo(false)} title={`${chatName(activeChat)} — Info`}>
        {membersLoading ? (
          <div style={{ padding:32, display:'flex', justifyContent:'center' }}><Spinner /></div>
        ) : (
          <>
            {activeChat?.description && (
              <p style={{ color:'var(--text-muted)', fontSize:'.88rem' }}>{activeChat.description}</p>
            )}
            {iAmGroupAdmin && !groupEdit && (
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                <Button variant="secondary" size="sm" onClick={() => setGroupEdit({
                  name: activeChat.name || '', description: activeChat.description || '',
                  isReadOnly: !!activeChat.isReadOnly,
                })}>✏️ Edit group</Button>
                <Button variant="secondary" size="sm" onClick={() => { setAddingMember(true); loadContacts(''); }}>＋ Add member</Button>
              </div>
            )}
            {groupEdit && (
              <div style={{ border:'1px solid var(--border)', borderRadius:8, padding:12, marginBottom:12 }}>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input className="form-control" value={groupEdit.name}
                    onChange={e => setGroupEdit(g => ({ ...g, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input className="form-control" value={groupEdit.description}
                    onChange={e => setGroupEdit(g => ({ ...g, description: e.target.value }))} />
                </div>
                <label style={{ display:'flex', gap:8, alignItems:'center', cursor:'pointer', marginBottom:10 }}>
                  <input type="checkbox" checked={groupEdit.isReadOnly}
                    onChange={e => setGroupEdit(g => ({ ...g, isReadOnly: e.target.checked }))} />
                  Read-only
                </label>
                <div style={{ display:'flex', gap:8 }}>
                  <Button size="sm" onClick={saveGroupSettings}>Save</Button>
                  <Button size="sm" variant="secondary" onClick={() => setGroupEdit(null)}>Cancel</Button>
                </div>
              </div>
            )}
            {addingMember && (
              <div style={{ border:'1px solid var(--border)', borderRadius:8, padding:12, marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <strong style={{ fontSize:'.9rem' }}>Add member</strong>
                  <button className="btn btn-secondary btn-sm" onClick={() => setAddingMember(false)}>✕</button>
                </div>
                <input className="form-control" placeholder="Search people…" value={contactQ}
                  onChange={e => setContactQ(e.target.value)} style={{ marginBottom:8 }} />
                <div style={{ maxHeight:180, overflowY:'auto' }}>
                  {contacts
                    .filter(c => !members.some(m => String(m.user?._id) === String(c._id)))
                    .map(c => (
                      <div key={c._id} onClick={() => handleAddMember(c._id)}
                        style={{ padding:'6px 8px', cursor:'pointer', display:'flex', gap:8, alignItems:'center', borderRadius:6 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <ChatAvatar name={c.name} size={24} />
                        <span style={{ fontSize:'.85rem' }}>{c.name}</span>
                        <span style={{ fontSize:'.72rem', color:'var(--text-muted)', marginLeft:'auto', textTransform:'capitalize' }}>{c.role?.replace('_',' ')}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            <div style={{ fontWeight:600, fontSize:'.85rem', marginBottom:6 }}>Members ({members.length})</div>
            <div style={{ maxHeight:280, overflowY:'auto' }}>
              {members.map(m => (
                <div key={m._id} style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 4px', borderBottom:'1px solid var(--border)' }}>
                  <ChatAvatar name={m.user?.name} size={30} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'.88rem', fontWeight:600 }}>
                      {m.user?.name} {String(m.user?._id) === myId && '(you)'}
                    </div>
                    <div style={{ fontSize:'.72rem', color:'var(--text-muted)', textTransform:'capitalize' }}>{m.user?.role?.replace('_',' ')}</div>
                  </div>
                  {m.role === 'admin' && <Badge variant="info">admin</Badge>}
                  {(iAmGroupAdmin || String(m.user?._id) === myId) && members.length > 1 && (
                    <button className="btn btn-danger btn-sm"
                      onClick={() => handleRemoveMember(m.user?._id)}
                      title={String(m.user?._id) === myId ? 'Leave group' : 'Remove'}>
                      {String(m.user?._id) === myId ? 'Leave' : '✕'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>

      {/* Oversight modal (school_admin) */}
      <Modal open={showOversight} onClose={() => setShowOversight(false)} title="Chat Oversight" maxWidth={640}>
        {!ovUser ? (
          <>
            <input className="form-control" placeholder="Search school users…" autoFocus
              value={ovUserQ} onChange={e => setOvUserQ(e.target.value)} style={{ marginBottom:10 }} />
            <div style={{ maxHeight:380, overflowY:'auto' }}>
              {ovUsers.map(u => (
                <div key={u._id} onClick={() => openOvUser(u)}
                  style={{ padding:'8px 10px', cursor:'pointer', display:'flex', gap:10, alignItems:'center', borderBottom:'1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <ChatAvatar name={u.name} size={30} />
                  <span style={{ fontSize:'.9rem', fontWeight:600 }}>{u.name}</span>
                  <span style={{ fontSize:'.75rem', color:'var(--text-muted)', marginLeft:'auto', textTransform:'capitalize' }}>{u.role?.replace('_',' ')}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setOvUser(null)}>← Back</button>
              <strong>{ovUser.name}</strong>
              <span style={{ fontSize:'.78rem', color:'var(--text-muted)', textTransform:'capitalize' }}>{ovUser.role?.replace('_',' ')}</span>
            </div>
            {ovLoading ? (
              <div style={{ padding:32, display:'flex', justifyContent:'center' }}><Spinner /></div>
            ) : ovChats.length === 0 ? (
              <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)' }}>This user has no chats.</div>
            ) : (
              <div style={{ maxHeight:380, overflowY:'auto' }}>
                {ovChats.map(c => (
                  <div key={c._id} onClick={() => openOvChat(c)}
                    style={{ padding:'8px 10px', cursor:'pointer', display:'flex', gap:10, alignItems:'center', borderBottom:'1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <ChatAvatar name={c.displayName || c.name} size={30} type={c.type} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'.9rem', fontWeight:600 }}>{c.displayName || c.name || 'Direct chat'}</div>
                      <div style={{ fontSize:'.78rem', color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {c.lastMessage?.content || 'No messages'}
                      </div>
                    </div>
                    <span style={{ fontSize:'.72rem', color:'var(--text-muted)' }}>{fmtTime(c.lastActivity)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Modal>

      <Confirm open={!!delMsg} onClose={() => setDelMsg(null)} onConfirm={confirmDelete}
        title="Delete Message" message="Delete this message for everyone?" />

      {/* Forward modal — pick a chat to forward to */}
      <Modal open={!!forwardMsg} onClose={() => setForwardMsg(null)} title="Forward message">
        {forwardMsg && (
          <div style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:'.85rem', maxHeight:80, overflow:'hidden' }}>
            <div style={{ fontSize:'.72rem', color:'var(--text-muted)', marginBottom:2 }}>{forwardMsg.sender?.name}</div>
            {forwardMsg.content || '(attachment)'}
          </div>
        )}
        <div style={{ maxHeight: 360, overflowY:'auto' }}>
          {chats.filter(c => !c.observer).map(c => (
            <div key={c._id} onClick={() => doForward(c)}
              style={{ padding:'10px 12px', cursor:'pointer', display:'flex', gap:10, alignItems:'center', borderBottom:'1px solid var(--border)', borderRadius:6 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <ChatAvatar name={chatName(c)} size={32} type={c.type} />
              <div style={{ fontWeight:600, fontSize:'.9rem' }}>{chatName(c)}</div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Edit history modal (school admin) */}
      <Modal open={!!historyMsg} onClose={() => setHistoryMsg(null)} title="Edit history">
        {historyMsg && (
          <div>
            <div style={{ fontSize:'.8rem', color:'var(--text-muted)', marginBottom:12 }}>
              Sent by <strong>{historyMsg.sender?.name}</strong> · {new Date(historyMsg.createdAt).toLocaleString('en-IN')}
            </div>
            {[...(historyMsg.editHistory || [])].map((h, i) => (
              <div key={i} style={{ borderLeft:'3px solid var(--border)', paddingLeft:12, marginBottom:12 }}>
                <div style={{ fontSize:'.72rem', color:'var(--text-muted)', marginBottom:2 }}>
                  Version {i + 1}{h.editedAt ? ` · replaced ${new Date(h.editedAt).toLocaleString('en-IN')}` : ''}
                </div>
                <div style={{ fontSize:'.9rem', textDecoration:'line-through', opacity:.75 }}>{h.content || '(empty)'}</div>
              </div>
            ))}
            <div style={{ borderLeft:'3px solid var(--success, #22c55e)', paddingLeft:12 }}>
              <div style={{ fontSize:'.72rem', color:'var(--success, #22c55e)', fontWeight:600, marginBottom:2 }}>
                Current{historyMsg.editedAt ? ` · edited ${new Date(historyMsg.editedAt).toLocaleString('en-IN')}` : ''}
              </div>
              <div style={{ fontSize:'.9rem' }}>{historyMsg.content}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
