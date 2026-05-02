// backend/multiSession.js
import { createWhatsAppClient } from './whatsapp.js';

const sessions = {};

export const startUserSession = (userId, io) => {
    if (!sessions[userId]) {
        console.log(`Starting fresh session for: ${userId}`);
        sessions[userId] = createWhatsAppClient(userId, io);
    }
    return sessions[userId];
};