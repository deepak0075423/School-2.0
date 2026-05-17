import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getChats, getMessages, sendMessage, getContacts, startDirectChat } from '../api/chat.api';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from '../components/ui/index';

const POLL_INTERVAL = 4000; // 4 s refresh

function fmtTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  const now = new Date();
  if (dt.toDateString() === now.toDateString()) {
    return dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function ChatAvatar({ name, size = 36 }) {
  const initials = (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--primary)',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
    }}>{initials}</div>
  );
}

export default function Chat() {
  const { user } = useAuth();

  const [chats, setChats]           = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages]     = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [text, setText]             = useState('');
  const [sending, setSending]       = useState(false);

  const [showNewChat, setShowNewChat] = useState(false);
  const [contacts, setContacts]     = useState([]);
  const [contactQ, setContactQ]     = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);

  const bottomRef  = useRef(null);
  const pollRef    = useRef(null);
  const activeChatRef = useRef(null);
  activeChatRef.current = activeChat;

  // ── Load chat list ────────────────────────────────────────────────────────────
  const loadChats = useCallback(async () => {
    try {
      const res = await getChats();
      setChats(res?.data || []);
    } catch { /* silent */ }
    finally { setChatsLoading(false); }
  }, []);

  useEffect(() => { loadChats(); }, [loadChats]);

  // ── Load messages for active chat + start polling ─────────────────────────────
  const loadMessages = useCallback(async (chatId, silent = false) => {
    if (!chatId) return;
    if (!silent) setMsgsLoading(true);
    try {
      const res = await getMessages(chatId);
      setMessages(res?.data || []);
    } catch { /* silent */ }
    finally { if (!silent) setMsgsLoading(false); }
  }, []);

  useEffect(() => {
    if (!activeChat) return;
    loadMessages(activeChat._id);
    pollRef.current = setInterval(() => {
      if (activeChatRef.current?._id) loadMessages(activeChatRef.current._id, true);
    }, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [activeChat, loadMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send ───────────────────────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !activeChat || sending) return;
    setSending(true);
    try {
      const res = await sendMessage(activeChat._id, { content: text.trim() });
      setMessages(m => [...m, res?.data]);
      setText('');
      loadChats();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setSending(false);
    }
  };

  // ── New direct chat ───────────────────────────────────────────────────────────
  const loadContacts = async (q = '') => {
    setContactsLoading(true);
    try {
      const res = await getContacts({ q: q || undefined });
      setContacts(res?.data || []);
    } catch { /* silent */ }
    finally { setContactsLoading(false); }
  };

  useEffect(() => {
    if (showNewChat) loadContacts(contactQ);
  }, [showNewChat, contactQ]);

  const handleStartChat = async (targetUserId) => {
    try {
      const res = await startDirectChat(targetUserId);
      const chat = res?.data;
      setShowNewChat(false);
      await loadChats();
      setActiveChat(chat);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  // ── Chat name helper ──────────────────────────────────────────────────────────
  const chatName = (chat) => {
    if (!chat) return '';
    if (chat.type === 'group' || chat.type === 'broadcast') return chat.name || 'Group';
    return chat.name || 'Direct Chat';
  };

  return (
    <div style={{ display:'flex', height:'calc(100vh - 64px)', overflow:'hidden' }}>

      {/* Sidebar */}
      <div style={{ width:300, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <strong style={{ fontSize:'1rem' }}>Messages</strong>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewChat(true)}>+ New</button>
        </div>

        <div style={{ overflowY:'auto', flex:1 }}>
          {chatsLoading ? (
            <div style={{ padding:32, display:'flex', justifyContent:'center' }}><Spinner /></div>
          ) : chats.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)', fontSize:'.9rem' }}>No chats yet.<br />Start one with "+ New".</div>
          ) : chats.map(chat => (
            <div key={chat._id}
              onClick={() => setActiveChat(chat)}
              style={{
                padding:'10px 16px', cursor:'pointer', display:'flex', gap:10, alignItems:'center',
                background: activeChat?._id === chat._id ? 'var(--bg-secondary)' : 'transparent',
                borderBottom:'1px solid var(--border)',
              }}>
              <ChatAvatar name={chatName(chat)} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontWeight:600, fontSize:'.9rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>{chatName(chat)}</span>
                  <span style={{ fontSize:'.72rem', color:'var(--text-muted)', flexShrink:0 }}>{fmtTime(chat.lastActivity)}</span>
                </div>
                <div style={{ fontSize:'.8rem', color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {chat.lastMessage?.isDeleted ? 'Message deleted' : chat.lastMessage?.content || 'No messages yet'}
                </div>
              </div>
              {chat.unreadCount > 0 && (
                <div style={{ background:'var(--primary)', color:'#fff', borderRadius:'50%', minWidth:18, height:18, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.7rem', fontWeight:700, flexShrink:0 }}>
                  {chat.unreadCount}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Message Area */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {!activeChat ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'var(--text-muted)' }}>
            <div style={{ fontSize:2.5+'rem', marginBottom:12 }}>💬</div>
            <div>Select a conversation or start a new one</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
              <ChatAvatar name={chatName(activeChat)} />
              <div>
                <div style={{ fontWeight:700 }}>{chatName(activeChat)}</div>
                <div style={{ fontSize:'.75rem', color:'var(--text-muted)', textTransform:'capitalize' }}>{activeChat.type} chat</div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:8 }}>
              {msgsLoading ? (
                <div style={{ display:'flex', justifyContent:'center', padding:32 }}><Spinner /></div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--text-muted)', marginTop:32 }}>No messages yet. Say hello!</div>
              ) : messages.map((msg) => {
                const isMine = String(msg.sender?._id || msg.sender) === String(user?._id);
                return (
                  <div key={msg._id} style={{ display:'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth:'70%' }}>
                      {!isMine && (
                        <div style={{ fontSize:'.75rem', color:'var(--text-muted)', marginBottom:2, marginLeft:4 }}>
                          {msg.sender?.name}
                        </div>
                      )}
                      <div style={{
                        background: isMine ? 'var(--primary)' : 'var(--bg-secondary)',
                        color: isMine ? '#fff' : 'inherit',
                        borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        padding:'8px 14px',
                        fontSize:'.9rem',
                        wordBreak:'break-word',
                        opacity: msg.isDeleted ? 0.5 : 1,
                        fontStyle: msg.isDeleted ? 'italic' : 'normal',
                      }}>
                        {msg.isDeleted ? 'This message was deleted' : msg.content}
                      </div>
                      <div style={{ fontSize:'.7rem', color:'var(--text-muted)', marginTop:2, textAlign: isMine ? 'right' : 'left', marginLeft:4, marginRight:4 }}>
                        {fmtTime(msg.createdAt)}{msg.isEdited && ' · edited'}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} style={{ padding:'12px 20px', borderTop:'1px solid var(--border)', display:'flex', gap:8, flexShrink:0 }}>
              <input
                className="form-control"
                placeholder="Type a message…"
                value={text}
                onChange={e => setText(e.target.value)}
                style={{ borderRadius:24 }}
                disabled={sending}
              />
              <button type="submit" className="btn btn-primary" disabled={!text.trim() || sending} style={{ borderRadius:24, minWidth:72 }}>
                {sending ? '…' : 'Send'}
              </button>
            </form>
          </>
        )}
      </div>

      {/* New Chat Overlay */}
      {showNewChat && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--bg-primary)', borderRadius:'var(--radius)', width:400, maxHeight:'80vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,.2)' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <strong>New Direct Chat</strong>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowNewChat(false)}>Close</button>
            </div>
            <div style={{ padding:'12px 20px' }}>
              <input className="form-control" placeholder="Search people…"
                value={contactQ} onChange={e => setContactQ(e.target.value)} />
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {contactsLoading ? (
                <div style={{ padding:32, display:'flex', justifyContent:'center' }}><Spinner /></div>
              ) : contacts.length === 0 ? (
                <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)' }}>No contacts found</div>
              ) : contacts.map(c => (
                <div key={c._id} onClick={() => handleStartChat(c._id)}
                  style={{ padding:'10px 20px', cursor:'pointer', display:'flex', gap:10, alignItems:'center', borderBottom:'1px solid var(--border)' }}
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
          </div>
        </div>
      )}
    </div>
  );
}
