import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getChats, heartbeat } from '../api/chat.api';

const ChatNotifyContext = createContext({ unreadTotal: 0, refresh: () => {} });
export const useChatNotify = () => useContext(ChatNotifyContext);

const POLL_MS      = 5000;   // chat list poll for badge + notifications
const HEARTBEAT_MS = 20000;  // presence heartbeat

/**
 * App-wide chat awareness that runs on every authenticated page (not just the
 * chat screen): keeps the unread badge current, fires browser notifications for
 * new messages when you're elsewhere, and heartbeats presence.
 */
export function ChatNotifyProvider({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const [unreadTotal, setUnreadTotal] = useState(0);

  const prevRef     = useRef({});     // chatId -> { lastMessageId, unread }
  const firstRef    = useRef(true);   // skip notifications on very first poll
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  // Ask for notification permission once (after login)
  useEffect(() => {
    if (!user) return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [user]);

  const fireNotification = useCallback((title, body) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Only notify when the chat screen isn't the focused thing
    const onChat = locationRef.current.startsWith('/chat');
    if (onChat && !document.hidden) return;
    try {
      const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'school-chat' });
      n.onclick = () => { window.focus(); window.location.href = '/chat'; n.close(); };
    } catch { /* ignore */ }
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await getChats();
      const chats = res?.data || [];
      let total = 0;
      const snapshot = {};
      const newOnes = [];

      for (const c of chats) {
        const unread = c.unreadCount || 0;
        total += unread;
        const lastId = c.lastMessage?._id || c.lastMessage?.createdAt || null;
        snapshot[c._id] = { lastId, unread };
        const prev = prevRef.current[c._id];
        // A newer message arrived (id changed) and it's unread and not from me
        if (prev && lastId && prev.lastId !== lastId && unread > prev.unread) {
          newOnes.push(c);
        }
      }

      setUnreadTotal(total);

      if (!firstRef.current) {
        for (const c of newOnes) {
          const name = c.displayName || c.name || 'New message';
          const preview = c.lastMessage?.isDeleted ? 'Message deleted'
            : c.lastMessage?.content || 'Sent you a message';
          fireNotification(`💬 ${name}`, preview);
        }
      }
      prevRef.current = snapshot;
      firstRef.current = false;
    } catch { /* silent */ }
  }, [fireNotification]);

  // Poll loop + heartbeat while logged in
  useEffect(() => {
    if (!user) { setUnreadTotal(0); prevRef.current = {}; firstRef.current = true; return; }
    poll();
    heartbeat().catch(() => {});
    const p = setInterval(poll, POLL_MS);
    const h = setInterval(() => heartbeat().catch(() => {}), HEARTBEAT_MS);
    return () => { clearInterval(p); clearInterval(h); };
  }, [user, poll]);

  return (
    <ChatNotifyContext.Provider value={{ unreadTotal, refresh: poll }}>
      {children}
    </ChatNotifyContext.Provider>
  );
}
