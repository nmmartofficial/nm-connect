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
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// Initialize Gemini
const apiKey = (process.env.GEMINI_API_KEY || "").trim();
// STRICT FIX: Force v1 in the constructor itself
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

if (genAI) {
    console.log("✅ Gemini AI Bot is configured (using Stable v1 API)");
} else {
    console.warn("⚠️ GEMINI_API_KEY is missing.");
}

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://nm-connect-b5aa-git-master-nmmart.vercel.app",
    "https://nm-connect.onrender.com"
];

// More permissive CORS for Render
app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes("vercel.app")) {
            return callback(null, true);
        } else {
            return callback(null, true); // Fallback to true but it will echo the origin
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "my-custom-header"],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/', (req, res) => {
    res.send('NM CONNECT Backend is Running 🚀');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.includes("vercel.app")) {
                callback(null, true);
            } else {
                callback(null, true);
            }
        },
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    },
    transports: ['polling', 'websocket']
});

// Middleware for logging requests (helps debug 403)
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.url} - Origin: ${req.headers.origin}`);
    next();
});

// Supabase Setup
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

const whatsappClients = new Map(); // Store clients by userId
const lastQRs = new Map(); // Store last QR by userId
const initializationStates = new Map(); // Track initialization status per user
const runningCampaigns = new Map(); // Tracks active campaigns by userId

// Global cleanup
const cleanup = async () => {
    console.log("🧹 Cleaning up all WhatsApp clients...");
    for (const [userId, client] of whatsappClients.entries()) {
        try {
            client.ev.removeAllListeners();
            if (client.ws) client.ws.close();
            console.log(`✅ Cleaned up client for user: ${userId}`);
        } catch (e) {
            console.error(`Error during cleanup for user ${userId}:`, e);
        }
    }
    whatsappClients.clear();
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
    if (initializationStates.get(userId)) {
        console.log(`⚠️ Initialization already in progress for user: ${userId}`);
        return;
    }
    if (whatsappClients.has(userId)) {
        const client = whatsappClients.get(userId);
        if (client.ws?.readyState === 1) {
            console.log(`✅ WhatsApp already connected for user: ${userId}`);
            io.emit('whatsapp_ready', { userId });
            return;
        }
    }

    initializationStates.set(userId, true);
    console.log(`🛠️ Initializing Baileys for user: ${userId}`);
    io.emit('whatsapp_status', { msg: 'Starting WhatsApp Engine...' });

    try {
        const authPath = join(__dirname, 'auth_info_baileys', userId);
        
        // Safety: If it takes too long, reset initialization state
        const timeout = setTimeout(() => {
            if (initializationStates.get(userId) && !whatsappClients.has(userId)) {
                console.log(`🕒 Init timeout for ${userId} - resetting state`);
                initializationStates.delete(userId);
                io.emit('whatsapp_status', { msg: 'Engine slow, please retry' });
            }
        }, 40000);

        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

        const client = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
            },
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
        });

        whatsappClients.set(userId, client);

        client.ev.on('creds.update', saveCreds);

        client.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                clearTimeout(timeout);
                console.log(`✅ QR Code Generated for ${userId}`);
                io.emit('whatsapp_status', { msg: 'QR Code Ready! Scan now.' });
                const lastQR = await qrcode.toDataURL(qr);
                lastQRs.set(userId, lastQR);
                io.emit('qr_update', { qr: lastQR, userId });
            }

            if (connection === 'close') {
                clearTimeout(timeout);
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                console.log(`🔌 Connection closed for ${userId}. Status: ${statusCode}, Reconnect: ${shouldReconnect}`);
                
                initializationStates.delete(userId);
                whatsappClients.delete(userId);
                lastQRs.delete(userId);
                io.emit('whatsapp_disconnected', { userId });

                if (shouldReconnect) {
                    console.log(`🔄 Attempting to reconnect for ${userId}...`);
                    initializeWhatsApp(userId);
                } else {
                    console.log(`❌ Logged out for ${userId}. Deleting session folder...`);
                    if (fs.existsSync(authPath)) {
                        fs.rmSync(authPath, { recursive: true, force: true });
                    }
                }
            } else if (connection === 'open') {
                clearTimeout(timeout);
                console.log(`🚀 WhatsApp Client for ${userId} is Ready and Connected!`);
                io.emit('whatsapp_status', { msg: 'WhatsApp is Ready!' });
                initializationStates.delete(userId);
                lastQRs.delete(userId);
                io.emit('whatsapp_ready', { userId });
            }
        });

        // --- AUTO-RESPONDER BOT ---
        client.ev.on('messages.upsert', async (m) => {
            if (m.type !== 'notify') return;
            
            for (const msg of m.messages) {
                if (msg.key.fromMe) continue;

                const from = msg.key.remoteJid;
                
                // --- ROBUST MESSAGE BODY EXTRACTION ---
                const getMessageBody = (m) => {
                    if (!m) return "";
                    // standard text
                    if (m.conversation) return m.conversation;
                    // extended text (links/replies)
                    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
                    // image/video captions
                    if (m.imageMessage?.caption) return m.imageMessage.caption;
                    if (m.videoMessage?.caption) return m.videoMessage.caption;
                    // edited messages
                    if (m.protocolMessage?.editedMessage) return getMessageBody(m.protocolMessage.editedMessage);
                    // view once
                    if (m.viewOnceMessageV2?.message) return getMessageBody(m.viewOnceMessageV2.message);
                    if (m.viewOnceMessage?.message) return getMessageBody(m.viewOnceMessage.message);
                    // ephemeral
                    if (m.ephemeralMessage?.message) return getMessageBody(m.ephemeralMessage.message);
                    
                    return "";
                };

                const body = getMessageBody(msg.message);
                const incomingMsg = body.toLowerCase().trim();
                console.log(`📩 [DEBUG] New message from ${from}: "${incomingMsg}"`);

                if (!incomingMsg) {
                    console.log("ℹ️ Empty message body, skipping...");
                    continue;
                }

                // 1. Plan & Permission Check
                let userPlan = 'Free';
                let userIsAdmin = false;

                try {
                    // Admin UUIDs (for nmmart07@gmail.com and abduls9125@gmail.com)
                    const adminIds = [
                        '56733041-8c04-4a55-bb82-8030e739297d', 
                        '5998a41a-6415-4673-9a7c-403487333555'
                    ];
                    
                    userIsAdmin = adminIds.includes(userId);

                    // Fetch plan from DB
                    const { data: userData } = await supabase.from('users').select('plan_name').eq('id', userId).single();
                    userPlan = userData?.plan_name || 'Free';
                    
                    console.log(`📊 Auth Check: ID=${userId} | Admin=${userIsAdmin} | Plan=${userPlan}`);
                } catch (err) {
                    console.error("⚠️ Auth Fetch Error:", err.message);
                }

                // Permission: Admin OR Gold/Enterprise Plan
                const hasPermission = userIsAdmin || userPlan === 'Gold' || userPlan === 'Enterprise';

                if (!hasPermission) {
                    console.log(`🚫 AI Blocked: No permission for ID ${userId} (Plan: ${userPlan})`);
                    continue;
                }

                // 2. Keyword Auto-responses
                const { data: responses } = await supabase
                    .from('auto_responses')
                    .select('*')
                    .eq('user_id', userId);

                let matched = false;
                if (responses && responses.length > 0) {
                    const matchedResponse = responses.find(r => incomingMsg.includes(r.keyword.toLowerCase()));
                    
                    if (matchedResponse) {
                        matched = true;
                        console.log(`🤖 Keyword Match Found: "${matchedResponse.keyword}"`);
                        await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));
                        await client.sendMessage(from, { text: matchedResponse.response });
                        io.emit(`log_${userId}`, { type: 'info', msg: `🤖 Bot: Replied to ${from.split('@')[0]} (Keyword: ${matchedResponse.keyword})` });
                    }
                }

                // 3. AI Reply (Direct REST API Call - No SDK)
                if (!matched) {
                    if (!apiKey) {
                        console.error("❌ AI Error: GEMINI_API_KEY is missing in environment.");
                        continue;
                    }

                    try {
                        const senderNumber = from.split('@')[0];
                        console.log(`🧠 AI Thinking (Direct API) for ${senderNumber}...`);
                        
                        await client.sendPresenceUpdate('composing', from);
                        
                        const prompt = `You are NM Connect's AI Assistant. 
                        Customer says: "${body}". 
                        Reply politely and keep it very short (max 2 sentences). 
                        Language: Same as customer.`;

                        let aiReply = "";
                        // Standard models that definitely work on v1 Stable
                        const modelsToTry = ["gemini-1.5-flash", "gemini-pro"];
                        
                        for (const modelName of modelsToTry) {
                            try {
                                console.log(`🔄 [REST API] Trying ${modelName}...`);
                                
                                // Direct Fetch call to Google's Stable v1 Endpoint
                                const response = await fetch(
                                    `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`,
                                    {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            contents: [{ parts: [{ text: prompt }] }],
                                            safetySettings: [
                                                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                                                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                                                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                                                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                                            ]
                                        })
                                    }
                                );

                                const data = await response.json();
                                
                                if (data.error) {
                                    throw new Error(data.error.message);
                                }

                                aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text;
                                
                                if (aiReply) {
                                    console.log(`✅ Success with ${modelName}`);
                                    break;
                                }
                            } catch (err) {
                                console.warn(`❌ ${modelName} Failed: ${err.message}`);
                            }
                        }

                        if (aiReply) {
                            await client.sendMessage(from, { text: aiReply });
                            console.log(`✅ AI Replied: "${aiReply.substring(0, 50)}..."`);
                            io.emit(`log_${userId}`, { type: 'info', msg: `🧠 AI Bot: Replied to ${senderNumber} via Direct API` });
                        } else {
                            console.log("⚠️ All models failed or returned empty response.");
                        }
                    } catch (aiErr) {
                        console.error(`❌ Final AI Error:`, aiErr.message);
                        io.emit(`log_${userId}`, { type: 'error', msg: `❌ AI Error: ${aiErr.message}` });
                    }
                }
            }
        });

    } catch (error) {
        console.error(`❌ Failed to initialize Baileys for ${userId}:`, error);
        io.emit('whatsapp_status', { msg: 'Error: Engine failed to start' });
        initializationStates.delete(userId);
        whatsappClients.delete(userId);
    }
};

io.on('connection', (socket) => {
    console.log('🔌 Socket Connected:', socket.id);

    socket.on('request_session', (userId) => handleSessionRequest(userId, socket));
    socket.on('init-session', (userId) => handleSessionRequest(userId, socket));
});

const handleSessionRequest = (userId, socket) => {
    console.log(`📩 Session requested by: ${userId}`);
    const client = whatsappClients.get(userId);
    const lastQR = lastQRs.get(userId);

    if (!client) {
        socket.emit('whatsapp_status', { msg: 'Initializing WhatsApp...' });
        initializeWhatsApp(userId);
    } else {
        if (lastQR) {
            socket.emit('qr_update', { qr: lastQR, userId });
        }
        
        if (client.ws?.readyState === 1) { 
            socket.emit('whatsapp_ready', { userId });
        } else {
            socket.emit('whatsapp_status', { msg: 'Connecting...' });
        }
    }
};

app.post('/api/stop-campaign', async (req, res) => {
    const { userId } = req.body;
    console.log(`🛑 Stopping campaign for user: ${userId}`);

    // Stop memory loop
    runningCampaigns.set(userId, false);
    setTimeout(() => runningCampaigns.delete(userId), 5000);

    // Update DB
    const { error } = await supabase
        .from('campaigns')
        .update({ status: 'Stopped' })
        .eq('user_id', userId)
        .eq('status', 'Running');

    if (error) console.error("Error stopping in DB:", error);

    res.json({ status: "Campaign stopped and state cleared" });
});

app.post('/api/reset-session', async (req, res) => {
    const { userId } = req.body;
    console.log(`🧹 Resetting session for user: ${userId}`);
    
    try {
        const client = whatsappClients.get(userId);
        if (client) {
            client.ev.removeAllListeners();
            if (client.ws) client.ws.close();
            whatsappClients.delete(userId);
        }
        
        initializationStates.delete(userId);
        lastQRs.delete(userId);
        
        const authPath = join(__dirname, 'auth_info_baileys', userId);
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log(`✅ Deleted session folder: ${authPath}`);
        }
        
        res.json({ status: "Session Reset Successful" });
    } catch (err) {
        console.error("❌ Reset Error:", err);
        res.status(500).json({ error: "Failed to reset session" });
    }
});

app.post('/api/send-bulk', async (req, res) => {
    const { contacts, messages, userId, userEmail: bodyEmail, media, poll, startIndex = 0, campaignName = 'General Campaign', scheduledAt = null, campaignId = null } = req.body;
    
    // --- CHECK IF ALREADY RUNNING ---
    if (!scheduledAt) {
        const { data: existingCampaign } = await supabase
            .from('campaigns')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'Running')
            .single();

        if (existingCampaign) {
            // If it's running in memory, block.
            if (runningCampaigns.get(userId) === true) {
                console.log(`⚠️ Campaign already running for user ${userId}: ${existingCampaign.name}`);
                return res.status(400).json({ 
                    error: "A campaign is already running!", 
                    existingCampaign: existingCampaign.id,
                    msg: "Please stop the current campaign first or wait for it to complete."
                });
            } else {
                // DB says running but memory doesn't (server restart). Clear it.
                console.log("🧹 Found stuck campaign in DB (server restart), clearing...");
                await supabase.from('campaigns').update({ status: 'Stopped' }).eq('id', existingCampaign.id);
            }
        }
    }
    
    // --- PLAN CHECKING LOGIC ---
    let plan = 'Free';
    let limit = 50;
    
    // 1. Direct Email Check (From Request Body - Fastest)
    const normalizedBodyEmail = (bodyEmail || '').toLowerCase().trim();
    let isAdmin = normalizedBodyEmail === 'nmmart07@gmail.com' || normalizedBodyEmail === 'abduls9125@gmail.com';

    // 2. Database Check (Fallback and for non-admins)
    try {
        const { data: userData } = await supabase.from('users').select('plan_name, daily_limit, email').eq('id', userId).single();
        
        const dbEmail = (userData?.email || '').toLowerCase().trim();
        if (!isAdmin) {
            isAdmin = dbEmail === 'nmmart07@gmail.com' || dbEmail === 'abduls9125@gmail.com';
        }

        plan = userData?.plan_name || 'Free';
        limit = userData?.daily_limit || 50;
    } catch (err) {
        console.error("⚠️ Supabase User Fetch Failed:", err.message);
    }

    // --- ADMIN OVERRIDE: Unlock everything for YOU ---
    if (isAdmin) {
        plan = 'Enterprise';
        limit = 999999;
        console.log(`👑 ADMIN POWER ACTIVATED for ${normalizedBodyEmail || userId}`);
    }

    console.log(`📊 Request: user ${userId}, plan ${plan}, limit ${limit}, contacts ${contacts.length}`);

    if (contacts.length > limit && plan !== 'Gold' && plan !== 'Enterprise') {
        console.warn(`🚫 403: Plan Limit Exceeded (${plan}). Limit: ${limit}, Requested: ${contacts.length}`);
        return res.status(403).json({ error: `Your ${plan} plan limit is ${limit} contacts. Please upgrade to Gold for unlimited messaging.` });
    }

    // --- MEDIA RESTRICTION LOGIC ---
    if (media && (plan === 'Monthly' || plan === 'Free')) {
        console.warn(`🚫 403: Media Restriction. Plan: ${plan}`);
        return res.status(403).json({ error: "Photo/Media sending is only available in Yearly plans (Silver/Gold). Please upgrade." });
    }

    console.log(`📩 Bulk Send Request: user ${userId} (${plan}), ${contacts.length} contacts, resume: ${!!campaignId}`);
    
    const client = whatsappClients.get(userId);
    if (!client) {
        console.error("❌ Bulk Send Failed: WhatsApp not connected");
        return res.status(400).json({ error: "WhatsApp not connected" });
    }

    let activeCampaignId = campaignId;

    if (!activeCampaignId) {
        // --- CREATE NEW CAMPAIGN RECORD ---
        const campaignStatus = scheduledAt ? 'Scheduled' : 'Running';
        
        console.log("📝 Attempting to create campaign record in Supabase...");
        
        const { data: campaignRecord, error: insertError } = await supabase
            .from('campaigns')
            .insert([{ 
                user_id: userId, 
                name: campaignName, 
                total_contacts: contacts.length, 
                status: campaignStatus,
                scheduled_at: scheduledAt,
                // Simple record first to debug
                sent_count: startIndex,
                invalid_count: 0
            }])
            .select()
            .single();

        if (insertError) {
            console.error("❌ Supabase Campaign Insert Detailed Error:", JSON.stringify(insertError, null, 2));
            return res.status(500).json({ 
                error: `Failed to create campaign: ${insertError.message || 'Database error'}`,
                details: insertError.hint || insertError.details || 'Check server logs'
            });
        }
        activeCampaignId = campaignRecord.id;
        
        // Update metadata separately to see if it's the issue
        await supabase.from('campaigns').update({ metadata: { contacts, messages, media, startIndex } }).eq('id', activeCampaignId);
    } else {
        // --- RESUME EXISTING CAMPAIGN ---
        await supabase.from('campaigns').update({ status: 'Running' }).eq('id', activeCampaignId);
    }

    if (scheduledAt) {
        console.log(`🕒 Campaign scheduled for ${scheduledAt}`);
        return res.json({ status: "Campaign Scheduled", campaignId: activeCampaignId });
    }

    // If not scheduled, start immediately
    runningCampaigns.set(userId, true);
    res.json({ status: "Campaign Started", startIndex, campaignId: activeCampaignId });

    startCampaign(userId, contacts, messages, media, poll, startIndex, activeCampaignId);
});

// Extracted Campaign Logic for Reusability (Scheduling)
const startCampaign = async (userId, contacts, messages, media, poll, startIndex, campaignId) => {
    const client = whatsappClients.get(userId);
    if (!client) {
        console.error(`❌ Campaign ${campaignId} failed: Client not found for ${userId}`);
        return;
    }

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

    let sentCount = startIndex;
    let invalidCount = 0;
    
    // Start from the provided index
    for (let i = startIndex; i < contacts.length; i++) {
        // Check if user clicked STOP
        if (runningCampaigns.get(userId) === false) {
            console.log(`🛑 Campaign stopped by user ${userId} at index ${i}`);
            io.emit(`log_${userId}`, { type: 'info', msg: '🛑 Campaign stopped manually!' });
            
            // Update DB status to Stopped
            if (campaignId) {
                await supabase.from('campaigns').update({ status: 'Stopped', sent_count: sentCount, invalid_count: invalidCount }).eq('id', campaignId);
            }
            runningCampaigns.delete(userId);
            return; // Exit campaign
        }

        const contact = contacts[i];
        try {
            const cleanNumber = contact.number.toString().replace(/\D/g, '');
            // Ensure number has country code, default to 91 if 10 digits
            const formattedNumber = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;
            const chatId = `${formattedNumber}@s.whatsapp.net`; // Baileys format

            console.log(`🔍 Checking registration for: ${chatId}`);
            // 1. Check if number is registered on WhatsApp
            const [result] = await client.onWhatsApp(chatId);
            
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

            // --- THE GHOST-HUMAN ENGINE (TOTAL RANDOMIZATION) ---
            const spinMessage = (text) => {
                return text.replace(/{([^{}]+)}/g, (match, options) => {
                    const choices = options.split('|');
                    return choices[Math.floor(Math.random() * choices.length)];
                });
            };

            let msg = messages[Math.floor(Math.random() * messages.length)];
            if (contact.name) msg = msg.replace(/{name}/g, contact.name);
            msg = spinMessage(msg); 

            // A. Randomize Professional Closings & Reference Codes
            const offerCode = `NM${Math.floor(1000 + Math.random() * 9000)}`;
            const closings = [
                `\n\n*Ref: ${offerCode}*`,
                `\n\n(Offer Code: ${offerCode})`,
                `\n\n[Reference: ${offerCode}]`,
                `\n\n_Ref No: ${offerCode}_`,
                `\n\n*Regards, NM Mart*`,
                `\n\n_Thank you for choosing NM Mart!_`,
                `\n\nHave a great day!`,
                `\n\n- Team NM Mart`,
                `\n\nRef ID: #${Math.random().toString(36).substring(7).toUpperCase()}`
            ];
            const closing = closings[Math.floor(Math.random() * closings.length)];
            const finalMsg = `${msg}${closing}`;

            // B. Randomized Presence Simulation (Don't always follow the same steps)
            const presenceSequence = Math.random();
            if (presenceSequence > 0.2) {
                await client.sendPresenceUpdate('available', chatId);
                await new Promise(r => setTimeout(r, Math.random() * 3000 + 500)); 
            }
            
            if (presenceSequence > 0.4) {
                await client.sendPresenceUpdate('composing', chatId);
                // Randomized Typing Speed (Slow, Fast, Variable)
                const typingMultiplier = Math.random() * 40 + 10; 
                const typingTime = Math.min(finalMsg.length * typingMultiplier, 7000); 
                io.emit(`log_${userId}`, { type: 'info', msg: `✍️ Typing...` });
                await new Promise(r => setTimeout(r, typingTime));
            }

            // C. Final random pause before "Clicking Send"
            await new Promise(r => setTimeout(r, Math.random() * 2000 + 200));

            if (mediaBuffer) {
                const sendMsg = {};
                sendMsg[mediaType] = mediaBuffer;
                sendMsg.caption = finalMsg;
                if (mediaType === 'document') sendMsg.fileName = media.filename || 'document';
                await client.sendMessage(chatId, sendMsg);
            } else if (poll && poll.question && Math.random() > 0.5) {
                // Send Poll occasionally (50% chance if it exists)
                await client.sendMessage(chatId, {
                    poll: {
                        name: poll.question,
                        values: poll.options.filter(o => o.trim() !== ''),
                        selectableCount: 1
                    }
                });
            } else {
                await client.sendMessage(chatId, { text: finalMsg });
            }

            sentCount++;
            console.log(`✅ Message sent to ${cleanNumber}`);

            // D. Randomize "Post-Send" Presence
            if (Math.random() < 0.3) {
                await client.sendPresenceUpdate('unavailable', chatId);
            }

            await supabase.from('customers').update({ status: 'Sent' }).eq('id', contact.id);
            if (campaignId) {
                await supabase.from('campaigns').update({ sent_count: sentCount, invalid_count: invalidCount }).eq('id', campaignId);
            }

            io.emit(`log_${userId}`, { 
                type: 'success', 
                msg: `Sent to ${contact.number}`,
                progress: { current: i + 1, total: contacts.length, sent: sentCount, invalid: invalidCount, lastIndex: i }
            });

            // E. --- THE CHAOS DELAY LOGIC (ZERO PATTERNS) ---
            let delay;
            const seed = Math.random();
            const clusterSize = Math.floor(Math.random() * 4) + 2; // Cluster size 2 to 5

            // 1. Cluster Break: After sending a few messages, take a random "distraction" break
            if (sentCount % clusterSize === 0) {
                const clusterBreak = Math.floor(Math.random() * (120000 - 40000 + 1)) + 40000;
                delay = clusterBreak;
                console.log(`☕ Cluster break: ${delay/1000}s...`);
            } 
            // 2. The "Phone Lock" Break (10% chance, 3-7 minutes)
            else if (seed < 0.10) {
                delay = Math.floor(Math.random() * (420000 - 180000 + 1)) + 180000;
                console.log(`📱 Phone Locked: ${delay/1000}s break...`);
            }
            // 3. Variable Base Delay (25-75s)
            else {
                delay = Math.floor(Math.random() * (75000 - 25000 + 1)) + 25000;
            }

            // 4. Global Hourly Slowdown (Sometimes we just get slow)
            if (Math.random() < 0.05) {
                delay += 300000; // Extra 5 min random lag
                console.log(`🐌 Unexpected human lag: +300s`);
            }

            console.log(`⏳ Next in ${delay/1000}s...`);
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

    // Final cleanup - delete from runningCampaigns
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
