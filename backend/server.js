require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

const initializeWhatsApp = async (userId) => {
    if (isInitializing) return;
    if (whatsappClient) return;

    isInitializing = true;
    console.log(`🛠️ Initializing WhatsApp for user: ${userId}`);
    io.emit('whatsapp_status', { msg: 'Starting Browser Engine...' });

    // Thoda delay taaki purana process release ho jaye
    await new Promise(r => setTimeout(r, 2000));

    try {
        whatsappClient = new Client({
            authStrategy: new LocalAuth({ 
                clientId: userId,
                dataPath: './.wwebjs_auth' 
            }),
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014133536-alpha.html',
            },
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--single-process',
                    '--js-flags="--max-old-space-size=256"'
                ],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
            }
        });

        io.emit('whatsapp_status', { msg: 'Connecting to WhatsApp...' });
        console.log("⏳ Calling whatsappClient.initialize()...");

        whatsappClient.on('qr', async (qr) => {
            console.log("✅ QR Code Generated. Please scan now.");
            io.emit('whatsapp_status', { msg: 'QR Code Generated! Please scan.' });
            lastQR = await qrcode.toDataURL(qr);
            io.emit('qr_update', { qr: lastQR, userId });
        });

        whatsappClient.on('authenticated', () => {
            console.log("� Authenticated successfully! Loading chats...");
            io.emit('whatsapp_status', { msg: 'Authenticated! Loading chats...' });
            lastQR = null;
            io.emit('whatsapp_authenticated', { userId });
        });

        whatsappClient.on('ready', () => {
            console.log("� WhatsApp Client is Ready and Connected!");
            io.emit('whatsapp_status', { msg: 'WhatsApp is Ready!' });
            isInitializing = false;
            lastQR = null;
            io.emit('whatsapp_ready', { userId });
        });

        // --- AUTO-RESPONDER BOT (Keyword-based) ---
        whatsappClient.on('message', async (msg) => {
            if (msg.fromMe) return; // Don't respond to own messages
            
            const incomingMsg = msg.body.toLowerCase();
            console.log(`📩 Received message from ${msg.from}: ${incomingMsg}`);

            // 1. Fetch user data to check plan
            const { data: userData } = await supabase.from('users').select('plan_name').eq('id', userId).single();
            const plan = userData?.plan_name || 'Free';

            // Bot only works for Gold/Enterprise users
            if (plan !== 'Gold' && plan !== 'Enterprise') {
                return;
            }

            // 2. Fetch auto-responses from Supabase for this user
            const { data: responses } = await supabase
                .from('auto_responses')
                .select('*')
                .eq('user_id', userId);

            if (responses && responses.length > 0) {
                const matchedResponse = responses.find(r => incomingMsg.includes(r.keyword.toLowerCase()));
                
                if (matchedResponse) {
                    console.log(`🤖 Auto-responding to ${msg.from} with keyword: ${matchedResponse.keyword}`);
                    
                    // Human-like delay before auto-reply
                    await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
                    
                    await msg.reply(matchedResponse.response);
                    
                    io.emit(`log_${userId}`, { 
                        type: 'info', 
                        msg: `🤖 Bot: Auto-replied to ${msg.from.split('@')[0]} (Keyword: ${matchedResponse.keyword})` 
                    });
                }
            }
        });

        whatsappClient.on('auth_failure', (msg) => {
            console.error("❌ Auth Failure:", msg);
            isInitializing = false;
            whatsappClient = null;
            io.emit('whatsapp_error', { message: 'Auth failed' });
        });

        whatsappClient.on('disconnected', (reason) => {
            console.log("🔌 WhatsApp Disconnected:", reason);
            isInitializing = false;
            whatsappClient = null;
            lastQR = null;
            io.emit('whatsapp_disconnected');
        });

        whatsappClient.initialize().catch(err => {
            console.error("💥 Init Error:", err.message);
            isInitializing = false;
            whatsappClient = null;
        });
    } catch (error) {
        console.error("❌ Failed to initialize WhatsApp:", error);
        io.emit('whatsapp_status', { msg: 'Error: Browser failed to start' });
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
        
        whatsappClient.getState().then(state => {
            console.log(`📡 Current WhatsApp State: ${state}`);
            if (state === 'CONNECTED') {
                socket.emit('whatsapp_ready', { userId });
            } else {
                socket.emit('whatsapp_status', { msg: `Status: ${state || 'Initializing...'}` });
            }
        }).catch(() => {
            socket.emit('whatsapp_status', { msg: 'Connecting...' });
        });
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
    let messageMedia = null;
    if (media && media.data) {
        try {
            messageMedia = new MessageMedia(media.mimetype, media.data, media.filename);
            console.log("📎 Media attached to campaign");
        } catch (mediaErr) {
            console.error("❌ Media creation error:", mediaErr.message);
        }
    }

    let sentCount = 0;
    let invalidCount = 0;
    
    // Randomize batch thresholds initially to prevent any fixed patterns
    let nextDistractionAt = Math.floor(Math.random() * (15 - 8 + 1)) + 8; 
    let nextCoffeeAt = Math.floor(Math.random() * (55 - 35 + 1)) + 35;

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
            const chatId = `${cleanNumber}@c.us`;

            // 1. Check if number is registered on WhatsApp
            const isRegistered = await whatsappClient.isRegisteredUser(chatId);
            
            if (!isRegistered) {
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

                // --- THE CHAOS ENGINE: 100% UNPREDICTABLE BUSINESS MESSAGING ---
                
                // A. Professional Closings Variation (Prevents text pattern detection)
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

                // B. Spintax + Name Personalization
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

                const chat = await whatsappClient.getChatById(chatId);
                
                // C. Simulate Human "Pre-Message" Behavior
                await whatsappClient.sendPresenceAvailable();
                io.emit(`log_${userId}`, { type: 'info', msg: `📖 Checking chat with ${contact.number}...` });
                await chat.sendSeen(); 
                await new Promise(r => setTimeout(r, Math.random() * 2000 + 500)); // Read for 0.5-2.5s
                
                // D. Variable Typing & "Thinking" Pauses
                await chat.sendStateTyping();
                const typingTime = Math.min(finalMsg.length * (Math.random() * 25 + 15), 5000); 
                io.emit(`log_${userId}`, { type: 'info', msg: `✍️ Typing personalized offer...` });
                await new Promise(r => setTimeout(r, typingTime));

                // Tiny pause after typing (thinking before clicking send)
                await new Promise(r => setTimeout(r, Math.random() * 1500 + 500));

                if (messageMedia) {
                    await whatsappClient.sendMessage(chatId, messageMedia, { caption: finalMsg });
                } else {
                    await whatsappClient.sendMessage(chatId, finalMsg);
                }

                sentCount++;
                console.log(`✅ Message sent to ${cleanNumber}`);

                await supabase.from('customers').update({ status: 'Sent' }).eq('id', contact.id);
                
                // Update Campaign Record intermittently
                if (campaignId) {
                    await supabase.from('campaigns').update({ sent_count: sentCount, invalid_count: invalidCount }).eq('id', campaignId);
                }

                // Emit progress update
                io.emit(`log_${userId}`, { 
                    type: 'success', 
                    msg: `Sent to ${contact.number}`,
                    progress: { current: i + 1, total: contacts.length, sent: sentCount, invalid: invalidCount, lastIndex: i }
                });

                // E. PROBABILITY-BASED CHAOS (No fixed cycles or patterns)
                let delay;
                const chaosChance = Math.random(); // 0 to 1

                if (chaosChance < 0.05 && sentCount > 10) { 
                    // 5% CHANCE: "Deep Distraction" (12-25 mins) + GO OFFLINE
                    const deepMinutes = Math.floor(Math.random() * (25 - 12 + 1)) + 12;
                    delay = deepMinutes * 60 * 1000;
                    console.log(`🛌 Deep Distraction: Going offline for ${deepMinutes} mins...`);
                    io.emit(`log_${userId}`, { type: 'info', msg: `🛌 Offline break for ${deepMinutes} mins...` });
                    await whatsappClient.sendPresenceUnavailable(); // Simulate locking phone
                } else if (chaosChance < 0.15 && sentCount > 5) {
                    // 10% CHANCE: "Quick Phone Check" (2-5 mins)
                    const quickMinutes = Math.floor(Math.random() * (5 - 2 + 1)) + 2;
                    delay = quickMinutes * 60 * 1000;
                    console.log(`📱 Quick Check: Waiting ${quickMinutes} mins...`);
                    io.emit(`log_${userId}`, { type: 'info', msg: `📱 Random phone check for ${quickMinutes} mins...` });
                } else {
                    // REGULAR HUMAN DELAY (20-55 seconds)
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
 
       // Final Campaign Update
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
