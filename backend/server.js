import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { handleBulkSend } from './campaign.js';
import { createWhatsAppClient } from './whatsapp.js';

const app = express();

// 1. CORS Configuration (Fixed for Vercel/Render)
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            "https://nm-connect-b5aa.vercel.app", 
            "https://nm-connect-b5aa-git-main-nmmart.vercel.app",
            "http://localhost:5173"
        ];
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST"],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

// Health Check (Zaroori: Render server ko jagaye rakhne ke liye)
app.get('/health', (req, res) => res.status(200).send('Server is Active'));

const server = createServer(app);

// 2. Optimized Socket.io with CORS
const io = new Server(server, {
    cors: corsOptions,
    pingTimeout: 60000,
    allowEIO3: true
});

const userClients = {};
const initializingClients = {}; 

const cleanUserLock = (userId) => {
    const sessionPath = path.join(process.cwd(), '.wwebjs_auth', `session-${userId}`);
    if (fs.existsSync(sessionPath)) {
        try {
            const lockPath = path.join(sessionPath, 'Default', 'LOCK');
            const singletonLock = path.join(sessionPath, 'SingletonLock');
            if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
            if (fs.existsSync(singletonLock)) fs.unlinkSync(singletonLock);
            console.log(`[System] Locks cleared for ${userId}`);
        } catch (err) {
            console.error(`Error cleaning locks: ${err.message}`);
        }
    }
};

io.on('connection', (socket) => {
    console.log('User Dashboard Linked');

    socket.on('init-session', async (userId) => {
        if (!userId) {
            console.log("❌ Init Session failed: No UserID provided");
            return;
        }

        console.log(`🚀 Init Session request for: ${userId}`);

        // Agar client pehle se connected hai, toh seedhe signal bhej do
        if (userClients[userId] && userClients[userId].pupPage) {
            console.log(`✅ Session already active for ${userId}`);
            return socket.emit(`ready_${userId}`, 'Connected');
        }

        if (initializingClients[userId]) return;

        console.log(`[Auth] Initializing WhatsApp for ${userId}`);
        initializingClients[userId] = true;
        
        cleanUserLock(userId);
        
        try {
            // Hum io (poora instance) aur socket (sirf ye user) dono bhej rahe hain
            userClients[userId] = createWhatsAppClient(userId, io);
        } catch (error) {
            console.error("Client Init Error:", error);
            delete initializingClients[userId];
        } finally {
            // 10 second baad lock hata do taaki retry kiya ja sake
            setTimeout(() => delete initializingClients[userId], 10000);
        }
    });

    socket.on('disconnect', () => {
        console.log('User Disconnected from Socket');
    });
});

app.post('/send-bulk', async (req, res) => {
    const { userId } = req.body;
    if (!userClients[userId]) {
        return res.status(400).json({ success: false, msg: "WhatsApp not linked. Please scan QR." });
    }
    handleBulkSend(req, res, userClients, io);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`NM CONNECT LIVE ON PORT ${PORT}`);
});