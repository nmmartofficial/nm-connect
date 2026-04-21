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
    process.env.SUPABASE_URL || 'https://lxdqygldjjbgpzpklbns.supabase.co',
    process.env.SUPABASE_KEY || 'sb_publishable_Y1d7P8E-IH-IfVI1tOb3NQ_zZSs5-yc'
);

const sessions = {};

// --- WHATSAPP SETUP ---
const createSession = (userId) => {
    console.log(`Creating session for: ${userId}`);
    
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
                '--disable-gpu'
            ],
        }
    });

    client.on('qr', (qr) => {
        console.log(`QR Generated for ${userId}`);
        io.emit(`qr_${userId}`, qr);
    });

    client.on('ready', () => {
        console.log(`WhatsApp Ready for ${userId}`);
        io.emit(`ready_${userId}`, { status: 'connected' });
    });

    client.on('authenticated', () => {
        console.log(`Authenticated ${userId}`);
        io.emit(`authenticated_${userId}`);
    });

    client.on('auth_failure', (msg) => {
        console.error(`Auth Failure ${userId}:`, msg);
        io.emit(`error_${userId}`, 'Authentication failed');
    });

    client.on('disconnected', (reason) => {
        console.log(`Disconnected ${userId}:`, reason);
        io.emit(`disconnected_${userId}`);
        delete sessions[userId];
        client.initialize().catch(err => console.error("Re-init Error:", err));
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

    client.initialize().catch(err => console.error("Init Error:", err));
    sessions[userId] = client;
};

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    console.log('New client connected');
    
    socket.on('init-session', (userId) => {
        if (!userId) return;
        if (!sessions[userId]) {
            createSession(userId);
        } else {
            sessions[userId].getState().then(state => {
                if (state === 'CONNECTED') io.emit(`ready_${userId}`);
            }).catch(() => {
                // If state check fails, assume disconnected
                createSession(userId);
            });
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
            
            // Variable Parsing (e.g., {name})
            if (contact.name) {
                msg = msg.replace(/{name}/g, contact.name);
            }

            const cleanNumber = contact.number.replace(/\D/g, '');
            const chatId = `${cleanNumber}@c.us`;
            
            if (messageMedia) {
                await client.sendMessage(chatId, messageMedia, { caption: msg });
            } else {
                await client.sendMessage(chatId, msg);
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
            
            // 4-second delay requested by user
            await new Promise(resolve => setTimeout(resolve, 4000)); 
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
