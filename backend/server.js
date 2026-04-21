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

let whatsappClient = null;
let isInitializing = false;
let lastQR = null;

const initializeWhatsApp = (userId) => {
    if (isInitializing) return;
    if (whatsappClient) return;

    isInitializing = true;
    console.log(`🛠️ Initializing WhatsApp for user: ${userId}`);

    whatsappClient = new Client({
        authStrategy: new LocalAuth({ clientId: userId }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions',
                '--disable-component-update',
                '--disable-features=Translate',
                '--disable-sync',
                '--no-default-browser-check',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ],
        }
    });

    whatsappClient.on('qr', async (qr) => {
        console.log("✅ QR Code Generated. Please scan now.");
        lastQR = await qrcode.toDataURL(qr);
        io.emit('qr_update', { qr: lastQR, userId });
    });

    whatsappClient.on('authenticated', () => {
        console.log("� Authenticated successfully! Loading chats...");
        lastQR = null;
        io.emit('whatsapp_authenticated', { userId });
    });

    whatsappClient.on('ready', () => {
        console.log("� WhatsApp Client is Ready and Connected!");
        isInitializing = false;
        lastQR = null;
        io.emit('whatsapp_ready', { userId });
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
};

io.on('connection', (socket) => {
    console.log('🔌 Socket Connected:', socket.id);

    socket.on('request_session', (userId) => {
        console.log(`📩 Session requested by: ${userId}`);
        if (!whatsappClient) {
            initializeWhatsApp(userId);
        } else {
            if (lastQR) {
                socket.emit('qr_update', { qr: lastQR, userId });
            }
            whatsappClient.getState().then(state => {
                if (state === 'CONNECTED') {
                    socket.emit('whatsapp_ready', { userId });
                }
            }).catch(() => {});
        }
    });
});

app.post('/api/send-bulk', async (req, res) => {
    const { contacts, messages, userId, media } = req.body;
    
    if (!whatsappClient) return res.status(400).json({ error: "WhatsApp not connected" });

    res.json({ status: "Campaign Started" });

    let messageMedia = null;
    if (media && media.data) {
        messageMedia = new MessageMedia(media.mimetype, media.data, media.filename);
    }

    for (const contact of contacts) {
        try {
            let msg = messages[Math.floor(Math.random() * messages.length)];
            if (contact.name) msg = msg.replace(/{name}/g, contact.name);
            
            const randomString = Math.random().toString(36).substring(7);
            const finalMsg = `${msg}\n\n_${randomString}_`;
            const chatId = `${contact.number.replace(/\D/g, '')}@c.us`;

            if (messageMedia) {
                await whatsappClient.sendMessage(chatId, messageMedia, { caption: finalMsg });
            } else {
                await whatsappClient.sendMessage(chatId, finalMsg);
            }

            await supabase.from('customers').update({ status: 'Sent' }).eq('id', contact.id);
            io.emit('campaign_log', { type: 'success', msg: `Sent to ${contact.number}` });

            const delay = Math.floor(Math.random() * (15000 - 8000 + 1)) + 8000;
            await new Promise(r => setTimeout(r, delay));
        } catch (err) {
            io.emit('campaign_log', { type: 'error', msg: `Failed: ${contact.number}` });
        }
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Master Server on port ${PORT}`));
