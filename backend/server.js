require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { join } = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/', (req, res) => {
    res.send('NM CONNECT Backend is Running 🚀');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Supabase Setup
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

let whatsappClient = null;
let isInitializing = false;
let lastQR = null;
const runningCampaigns = new Map(); // Tracks active campaigns by userId

// Global cleanup
const cleanup = async () => {
    if (whatsappClient) {
        console.log("🧹 Cleaning up WhatsApp client...");
        try {
            whatsappClient.ev.removeAllListeners();
            if (whatsappClient.ws) whatsappClient.ws.close();
        } catch (e) {
            console.error("Error during cleanup:", e);
        }
        whatsappClient = null;
    }
};

process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
});

const initializeWhatsApp = async (userId) => {
    if (isInitializing) return;
    if (whatsappClient) return;

    isInitializing = true;
    console.log(`🛠️ Initializing Baileys for user: ${userId}`);
    io.emit('whatsapp_status', { msg: 'Starting WhatsApp Engine...' });

    try {
        const { state, saveCreds } = await useMultiFileAuthState(join(__dirname, 'auth_info_baileys', userId));
        const { version } = await fetchLatestBaileysVersion();

        whatsappClient = makeWASocket({
            version,
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
            },
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Desktop'), // More stable than default
            syncFullHistory: false,
            markOnlineOnConnect: true,
        });

        whatsappClient.ev.on('creds.update', saveCreds);

        whatsappClient.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log("✅ QR Code Generated.");
                io.emit('whatsapp_status', { msg: 'QR Code Ready! Scan now.' });
                lastQR = await qrcode.toDataURL(qr);
                io.emit('qr_update', { qr: lastQR, userId });
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('🔌 Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
                
                isInitializing = false;
                whatsappClient = null;
                lastQR = null;
                io.emit('whatsapp_disconnected');

                if (shouldReconnect) {
                    initializeWhatsApp(userId);
                }
            } else if (connection === 'open') {
                console.log('🚀 WhatsApp Client is Ready and Connected!');
                io.emit('whatsapp_status', { msg: 'WhatsApp is Ready!' });
                isInitializing = false;
                lastQR = null;
                io.emit('whatsapp_ready', { userId });
            }
        });

        // --- AUTO-RESPONDER BOT (Keyword-based) ---
        whatsappClient.ev.on('messages.upsert', async (m) => {
            if (m.type !== 'notify') return;
            
            for (const msg of m.messages) {
                if (msg.key.fromMe) continue;

                const from = msg.key.remoteJid;
                const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
                const incomingMsg = body.toLowerCase();

                if (!incomingMsg) continue;

                console.log(`📩 Received message from ${from}: ${incomingMsg}`);

                // 1. Fetch user data to check plan
                const { data: userData } = await supabase.from('users').select('plan_name').eq('id', userId).single();
                const plan = userData?.plan_name || 'Free';

                // Bot only works for Gold/Enterprise users
                if (plan !== 'Gold' && plan !== 'Enterprise') {
                    continue;
                }

                // 2. Fetch auto-responses from Supabase for this user
                const { data: responses } = await supabase
                    .from('auto_responses')
                    .select('*')
                    .eq('user_id', userId);

                if (responses && responses.length > 0) {
                    const matchedResponse = responses.find(r => incomingMsg.includes(r.keyword.toLowerCase()));
                    
                    if (matchedResponse) {
                        console.log(`🤖 Auto-responding to ${from} with keyword: ${matchedResponse.keyword}`);
                        
                        // Human-like delay before auto-reply
                        await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
                        
                        await whatsappClient.sendMessage(from, { text: matchedResponse.response });
                        
                        io.emit(`log_${userId}`, { 
                            type: 'info', 
                            msg: `🤖 Bot: Auto-replied to ${from.split('@')[0]} (Keyword: ${matchedResponse.keyword})` 
                        });
                    }
                }
            }
        });

    } catch (error) {
        console.error("❌ Failed to initialize Baileys:", error);
        io.emit('whatsapp_status', { msg: 'Error: Engine failed to start' });
        isInitializing = false;
        whatsappClient = null;
    }
};

io.on('connection', (socket) => {
    console.log('🔌 Socket Connected:', socket.id);

    socket.on('request_session', (userId) => handleSessionRequest(userId, socket));
    socket.on('init-session', (userId) => handleSessionRequest(userId, socket));
});

const handleSessionRequest = (userId, socket) => {
    console.log(`📩 Session requested by: ${userId}`);
    if (!whatsappClient) {
        socket.emit('whatsapp_status', { msg: 'Initializing WhatsApp...' });
        initializeWhatsApp(userId);
    } else {
        if (lastQR) {
            socket.emit('qr_update', { qr: lastQR, userId });
        }
        
        // Check connection status in Baileys
        if (whatsappClient.ws?.readyState === 1) { // 1 is OPEN
            socket.emit('whatsapp_ready', { userId });
        } else {
            socket.emit('whatsapp_status', { msg: 'Connecting...' });
        }
    }
};

app.post('/api/stop-campaign', (req, res) => {
    const { userId } = req.body;
    if (runningCampaigns.has(userId)) {
        runningCampaigns.set(userId, false); // Mark it to stop
        console.log(`🛑 Stopping campaign for user: ${userId}`);
        return res.json({ status: "Stopping campaign..." });
    }
    res.status(400).json({ error: "No active campaign to stop" });
});

app.post('/api/send-bulk', async (req, res) => {
    const { contacts, messages, userId, media, startIndex = 0, campaignName = 'General Campaign', scheduledAt = null } = req.body;
    
    // --- PLAN CHECKING LOGIC ---
    const { data: userData } = await supabase.from('users').select('plan_name, daily_limit').eq('id', userId).single();
    const plan = userData?.plan_name || 'Free';
    const limit = userData?.daily_limit || 50;

    if (contacts.length > limit && plan !== 'Gold' && plan !== 'Enterprise') {
        return res.status(403).json({ error: `Your ${plan} plan limit is ${limit} contacts. Please upgrade to Gold for unlimited messaging.` });
    }

    // --- MEDIA RESTRICTION LOGIC ---
    if (media && plan === 'Monthly') {
        return res.status(403).json({ error: "Photo/Media sending is only available in Yearly plans (Silver/Gold). Please upgrade." });
    }

    console.log(`📩 Bulk Send Request: user ${userId} (${plan}), ${contacts.length} contacts`);
    
    if (!whatsappClient) {
        console.error("❌ Bulk Send Failed: WhatsApp not connected");
        return res.status(400).json({ error: "WhatsApp not connected" });
    }

    // --- CREATE CAMPAIGN RECORD (Reporting & Scheduling) ---
    const campaignStatus = scheduledAt ? 'Scheduled' : 'Running';
    
    const { data: campaignRecord } = await supabase
        .from('campaigns')
        .insert([{ 
            user_id: userId, 
            name: campaignName, 
            total_contacts: contacts.length, 
            status: campaignStatus,
            scheduled_at: scheduledAt,
            // Store original request data for scheduled runs
            metadata: { contacts, messages, media, startIndex } 
        }])
        .select()
        .single();

    if (scheduledAt) {
        console.log(`🕒 Campaign scheduled for ${scheduledAt}`);
        return res.json({ status: "Campaign Scheduled", campaignId: campaignRecord?.id });
    }

    // If not scheduled, start immediately
    runningCampaigns.set(userId, true);
    res.json({ status: "Campaign Started", startIndex, campaignId: campaignRecord?.id });

    startCampaign(userId, contacts, messages, media, startIndex, campaignRecord?.id);
});

// Extracted Campaign Logic for Reusability (Scheduling)
const startCampaign = async (userId, contacts, messages, media, startIndex, campaignId) => {
    let mediaBuffer = null;
    let mediaType = null;
    
    if (media && media.data) {
        try {
            mediaBuffer = Buffer.from(media.data, 'base64');
            mediaType = media.mimetype.startsWith('image') ? 'image' : 
                        media.mimetype.startsWith('video') ? 'video' : 'document';
            console.log(`📎 Media attached to campaign: ${mediaType}`);
        } catch (mediaErr) {
            console.error("❌ Media creation error:", mediaErr.message);
        }
    }

    let sentCount = 0;
    let invalidCount = 0;
    
    // Start from the provided index
    for (let i = startIndex; i < contacts.length; i++) {
        // Check if user clicked STOP
        if (runningCampaigns.get(userId) === false) {
            console.log(`🛑 Campaign stopped by user ${userId} at index ${i}`);
            io.emit(`log_${userId}`, { type: 'info', msg: '🛑 Campaign stopped manually!' });
            break;
        }

        const contact = contacts[i];
        try {
            const cleanNumber = contact.number.toString().replace(/\D/g, '');
            // Ensure number has country code, default to 91 if 10 digits
            const formattedNumber = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;
            const chatId = `${formattedNumber}@s.whatsapp.net`; // Baileys format

            console.log(`🔍 Checking registration for: ${chatId}`);
            // 1. Check if number is registered on WhatsApp
            const [result] = await whatsappClient.onWhatsApp(chatId);
            
            if (!result || !result.exists) {
                console.log(`🚫 Number ${cleanNumber} is not registered on WhatsApp. Removing...`);
                await supabase.from('customers').delete().eq('id', contact.id);
                invalidCount++;
                
                io.emit(`log_${userId}`, {
                      type: 'error', 
                      msg: `Invalid Number Removed: ${contact.number}`,
                      progress: { current: i + 1, total: contacts.length, sent: sentCount, invalid: invalidCount, lastIndex: i }
                  });
                  continue; // Skip to next contact
               }

                // --- THE CHAOS ENGINE ---
                const offerCode = `NM${Math.floor(1000 + Math.random() * 9000)}`;
                const closings = [
                    `\n\n*Ref: ${offerCode}*`,
                    `\n\n(Offer Code: ${offerCode})`,
                    `\n\n[Reference: ${offerCode}]`,
                    `\n\n_Ref No: ${offerCode}_`,
                    `\n\n*Regards, NM Mart*`,
                    `\n\n_Thank you for choosing NM Mart!_`
                ];
                const closing = closings[Math.floor(Math.random() * closings.length)];

                const spinMessage = (text) => {
                    return text.replace(/{([^{}]+)}/g, (match, options) => {
                        const choices = options.split('|');
                        return choices[Math.floor(Math.random() * choices.length)];
                    });
                };

                let msg = messages[Math.floor(Math.random() * messages.length)];
                if (contact.name) msg = msg.replace(/{name}/g, contact.name);
                msg = spinMessage(msg); 

                const finalMsg = `${msg}${closing}`;

                // Simulate Human Behavior
                await whatsappClient.sendPresenceUpdate('available', chatId);
                io.emit(`log_${userId}`, { type: 'info', msg: `📖 Checking chat with ${contact.number}...` });
                
                await new Promise(r => setTimeout(r, Math.random() * 2000 + 500)); 
                
                await whatsappClient.sendPresenceUpdate('composing', chatId);
                const typingTime = Math.min(finalMsg.length * (Math.random() * 25 + 15), 5000); 
                io.emit(`log_${userId}`, { type: 'info', msg: `✍️ Typing personalized offer...` });
                await new Promise(r => setTimeout(r, typingTime));

                await new Promise(r => setTimeout(r, Math.random() * 1500 + 500));

                if (mediaBuffer) {
                    const sendMsg = {};
                    sendMsg[mediaType] = mediaBuffer;
                    sendMsg.caption = finalMsg;
                    if (mediaType === 'document') sendMsg.fileName = media.filename || 'document';
                    
                    await whatsappClient.sendMessage(chatId, sendMsg);
                } else {
                    await whatsappClient.sendMessage(chatId, { text: finalMsg });
                }

                sentCount++;
                console.log(`✅ Message sent to ${cleanNumber}`);

                await supabase.from('customers').update({ status: 'Sent' }).eq('id', contact.id);
                
                if (campaignId) {
                    await supabase.from('campaigns').update({ sent_count: sentCount, invalid_count: invalidCount }).eq('id', campaignId);
                }

                io.emit(`log_${userId}`, { 
                    type: 'success', 
                    msg: `Sent to ${contact.number}`,
                    progress: { current: i + 1, total: contacts.length, sent: sentCount, invalid: invalidCount, lastIndex: i }
                });

                let delay;
                const chaosChance = Math.random();

                if (chaosChance < 0.05 && sentCount > 10) { 
                    const deepMinutes = Math.floor(Math.random() * (25 - 12 + 1)) + 12;
                    delay = deepMinutes * 60 * 1000;
                    console.log(`🛌 Deep Distraction: Going offline for ${deepMinutes} mins...`);
                    io.emit(`log_${userId}`, { type: 'info', msg: `🛌 Offline break for ${deepMinutes} mins...` });
                    await whatsappClient.sendPresenceUpdate('unavailable', chatId);
                } else if (chaosChance < 0.15 && sentCount > 5) {
                    const quickMinutes = Math.floor(Math.random() * (5 - 2 + 1)) + 2;
                    delay = quickMinutes * 60 * 1000;
                    console.log(`📱 Quick Check: Waiting ${quickMinutes} mins...`);
                    io.emit(`log_${userId}`, { type: 'info', msg: `📱 Random phone check for ${quickMinutes} mins...` });
                } else {
                    delay = Math.floor(Math.random() * (55000 - 20000 + 1)) + 20000;
                    console.log(`⏳ Waiting ${delay/1000}s for next message...`);
                }

                await new Promise(r => setTimeout(r, delay));
   
           } catch (err) {
               console.error(`❌ Failed to send to ${contact.number}:`, err.message);
               io.emit(`log_${userId}`, { 
                   type: 'error', 
                   msg: `Failed: ${contact.number}`,
                   progress: { current: i + 1, total: contacts.length, sent: sentCount, invalid: invalidCount, lastIndex: i }
               });
           }
       }
       console.log("🏁 Campaign finished");
       runningCampaigns.delete(userId);
 
       if (campaignId) {
           await supabase.from('campaigns').update({ status: 'Completed', sent_count: sentCount, invalid_count: invalidCount }).eq('id', campaignId);
       }
 
       io.emit(`log_${userId}`, { type: 'info', msg: '🏁 Campaign finished!' });
};

// --- CAMPAIGN SCHEDULER RUNNER (Every Minute) ---
setInterval(async () => {
    const now = new Date().toISOString();
    
    const { data: scheduledCampaigns } = await supabase
        .from('campaigns')
        .select('*')
        .eq('status', 'Scheduled')
        .lte('scheduled_at', now);

    if (scheduledCampaigns && scheduledCampaigns.length > 0) {
        for (const camp of scheduledCampaigns) {
            console.log(`🚀 Starting scheduled campaign: ${camp.name}`);
            
            // Mark as running first
            await supabase.from('campaigns').update({ status: 'Running' }).eq('id', camp.id);
            
            runningCampaigns.set(camp.user_id, true);
            
            const { contacts, messages, media, startIndex } = camp.metadata;
            startCampaign(camp.user_id, contacts, messages, media, startIndex, camp.id);
        }
    }
}, 60000); // Check every 60 seconds

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Master Server on port ${PORT}`));
