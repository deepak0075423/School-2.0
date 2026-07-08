import api from './axios';

// ── Chats & messages ──────────────────────────────────────────────────────────
export const getChats          = ()                => api.get('/chat/chats');
export const getMessages       = (chatId, params)  => api.get(`/chat/chats/${chatId}/messages`, { params });
export const sendMessage       = (chatId, data)    => api.post(`/chat/chats/${chatId}/messages`, data);
export const getChatMembers    = (chatId)          => api.get(`/chat/chats/${chatId}/members`);

// ── Contacts / search / unread ────────────────────────────────────────────────
export const getContacts       = (params)          => api.get('/chat/contacts', { params });
export const searchMessages    = (params)          => api.get('/chat/search', { params });
export const getUnreadCount    = ()                => api.get('/chat/unread-count');
export const heartbeat         = ()                => api.post('/chat/heartbeat');

// ── Create chats ──────────────────────────────────────────────────────────────
export const startDirectChat   = (targetUserId)    => api.post('/chat/direct', { targetUserId });
export const createGroup       = (data)            => api.post('/chat/group', data);

// ── Message actions ───────────────────────────────────────────────────────────
export const editMessage       = (msgId, content)  => api.patch(`/chat/messages/${msgId}`, { content });
export const deleteMessage     = (msgId)           => api.delete(`/chat/messages/${msgId}`);
export const toggleReaction    = (msgId, emoji)    => api.post(`/chat/messages/${msgId}/react`, { emoji });

// ── Group management ──────────────────────────────────────────────────────────
export const updateGroupSettings = (chatId, data)     => api.patch(`/chat/group/${chatId}/settings`, data);
export const addMember           = (chatId, memberId) => api.post(`/chat/group/${chatId}/member`, { memberId });
export const removeMember        = (chatId, memberId) => api.delete(`/chat/group/${chatId}/member/${memberId}`);

// ── Per-chat preferences ──────────────────────────────────────────────────────
export const toggleMute        = (chatId)          => api.post(`/chat/${chatId}/mute`);
export const toggleArchive     = (chatId)          => api.post(`/chat/${chatId}/archive`);

// ── Admin oversight ───────────────────────────────────────────────────────────
export const getSchoolUsers    = (params)          => api.get('/chat/admin/school-users', { params });
export const getAdminUserChats = (userId)          => api.get('/chat/admin/user-chats', { params: { userId } });
