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
app.use(express.json());

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

const sessions = {};
const initializingSessions = new Set();

// --- WHATSAPP SETUP ---
const createSession = async (userId) => {
    if (initializingSessions.has(userId)) {
        console.log(`⏳ Session for ${userId} is already initializing...`);
        return;
    }

    console.log(`🛠️ Creating session for: ${userId}`);
    initializingSessions.add(userId);
    
    try {
        const client = new Client({
            authStrategy: new LocalAuth({ clientId: userId }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu',
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ],
            }
        });

        client.on('qr', (qr) => {
            console.log(`✅ QR Generated for ${userId}`);
            qrcode.toDataURL(qr, (err, url) => {
                io.emit(`qr_${userId}`, url);
            });
        });

        client.on('ready', () => {
            console.log(`🚀 WhatsApp Ready for ${userId}`);
            initializingSessions.delete(userId);
            io.emit(`ready_${userId}`, { status: 'connected' });
        });

        client.on('authenticated', () => {
            console.log(`🔓 Authenticated ${userId}`);
        });

        client.on('auth_failure', (msg) => {
            console.error(`❌ Auth Failure ${userId}:`, msg);
            initializingSessions.delete(userId);
            io.emit(`error_${userId}`, 'Authentication failed');
        });

        client.on('disconnected', (reason) => {
            console.log(`🔌 Disconnected ${userId}:`, reason);
            io.emit(`disconnected_${userId}`);
            delete sessions[userId];
            initializingSessions.delete(userId);
        });

        client.on('message', async (msg) => {
            const text = msg.body.toLowerCase();
            
            // Simple Auto-Responder logic
            const responses = {
                'hi': 'Hello! Welcome to NM CONNECT. How can we help you today?',
                'hello': 'Hi there! NM CONNECT v5.0 is at your service.',
                'price': 'Our plans start from ₹499/mo. Check our dashboard for details!',
                'help': 'You can use NM CONNECT for bulk WhatsApp marketing, auto-replies, and analytics.',
            };

            for (const [keyword, response] of Object.entries(responses)) {
                if (text.includes(keyword)) {
                    await msg.reply(response);
                    io.emit(`log_${userId}`, { 
                        type: 'info', 
                        msg: `Auto-replied to ${msg.from} for keyword: ${keyword}`,
                        time: new Date().toLocaleTimeString() 
                    });
                    break;
                }
            }
        });

        await client.initialize();
        sessions[userId] = client;
    } catch (err) {
        console.error(`💥 Init Error for ${userId}:`, err.message);
        initializingSessions.delete(userId);
        io.emit(`error_${userId}`, 'Failed to initialize WhatsApp');
    }
};

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    console.log('🔌 New client connected');
    
    socket.on('init-session', async (userId) => {
        console.log(`📩 Received init-session for: ${userId}`);
        if (!userId) return;

        if (sessions[userId]) {
            try {
                const state = await sessions[userId].getState();
                console.log(`📡 Current state for ${userId}: ${state}`);
                if (state === 'CONNECTED') {
                    return io.emit(`ready_${userId}`);
                }
            } catch (e) {
                console.log(`⚠️ State check failed, cleaning up session...`);
                delete sessions[userId];
            }
        }

        if (!initializingSessions.has(userId)) {
            createSession(userId);
        } else {
            console.log(`⏳ Session already initializing for ${userId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// --- API ENDPOINT ---
app.post('/api/send-bulk', async (req, res) => {
    const { contacts, messages, userId, media } = req.body;
    const client = sessions[userId];

    if (!client) return res.status(400).json({ error: "Session not active" });

    res.json({ status: "Campaign Started" });

    let messageMedia = null;
    if (media && media.data && media.mimetype && media.filename) {
        messageMedia = new MessageMedia(media.mimetype, media.data, media.filename);
    }

    for (const contact of contacts) {
        try {
            let msg = messages[Math.floor(Math.random() * messages.length)];
            
            // Personalization
            if (contact.name) {
                msg = msg.replace(/{name}/g, contact.name);
            }

            // --- ANTI-BAN SPINNING ---
            // Message ke aakhir mein random hidden character ya timestamp add karna
            // taaki har message unique dikhe WhatsApp robot ko
            const randomString = Math.random().toString(36).substring(7);
            const finalMsg = `${msg}\n\n_${randomString}_`;

            const cleanNumber = contact.number.replace(/\D/g, '');
            const chatId = `${cleanNumber}@c.us`;
            
            if (messageMedia) {
                await client.sendMessage(chatId, messageMedia, { caption: finalMsg });
            } else {
                await client.sendMessage(chatId, finalMsg);
            }
            
            // Update Supabase status
            await supabase
                .from('customers')
                .update({ status: 'Sent' })
                .eq('id', contact.id);

            io.emit(`log_${userId}`, { 
                type: 'success', 
                msg: `Sent to ${contact.number}`,
                contactId: contact.id 
            });
            
            // --- DYNAMIC DELAY (8 to 15 seconds) ---
            // Fixed delay se robot pakad leta hai, isliye hum range use kar rahe hain
            const dynamicDelay = Math.floor(Math.random() * (15000 - 8000 + 1)) + 8000;
            await new Promise(resolve => setTimeout(resolve, dynamicDelay)); 
        } catch (err) {
            console.error(`Error sending to ${contact.number}:`, err);
            io.emit(`log_${userId}`, { 
                type: 'error', 
                msg: `Failed: ${contact.number}` 
            });
        }
    }
});

// Health check
app.get('/', (req, res) => res.send("NM CONNECT Backend Running"));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
