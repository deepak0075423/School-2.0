import api from './axios';

export const getChats          = ()             => api.get('/chat/chats');
export const getMessages       = (chatId, params) => api.get(`/chat/chats/${chatId}/messages`, { params });
export const sendMessage       = (chatId, data)  => api.post(`/chat/chats/${chatId}/messages`, data);
export const getContacts       = (params)        => api.get('/chat/contacts', { params });
export const startDirectChat   = (targetUserId)  => api.post('/chat/direct', { targetUserId });
export const getChatMembers    = (chatId)        => api.get(`/chat/chats/${chatId}/members`);
