require('dotenv').config();
const express = require('express'), http = require('http'), { Server } = require('socket.io'), cors = require('cors'), path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { initWA, baileysClients, lastQRs, processCampaign } = require(path.resolve(__dirname, 'whatsapp.js'));

const app = express(), server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const runningCampaigns = new Map();

app.use(cors(), express.json({ limit: '50mb' }), express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '../nm-dashboard/dist')));

app.use('/api', require(path.join(__dirname, 'router.js'))(io, supabase, runningCampaigns));
app.get('/api/status', (req, res) => res.send('NM CONNECT Running 🚀'));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../nm-dashboard/dist/index.html')));

io.on('connection', (socket) => {
    socket.on('request_session', (userId) => {
        const client = baileysClients.get(userId), qr = lastQRs.get(userId);
        if (client?.user) socket.emit('whatsapp_ready', { userId, info: client.user });
        else if (qr) socket.emit('qr_update', { qr, userId });
        else initWA(userId, io, supabase);
    });

    socket.on('reset_session', async (userId) => {
        const client = baileysClients.get(userId);
        if (client) {
            try { client.end(); } catch (e) {}
            baileysClients.delete(userId);
        }
        lastQRs.delete(userId);

        const authPath = path.join(__dirname, 'auth_info_baileys', userId);
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }

        initWA(userId, io, supabase);
    });
});

setInterval(async () => {
    const { data: camps } = await supabase.from('campaigns').select('*').eq('status', 'Scheduled').lte('scheduled_at', new Date().toISOString());
    camps?.forEach(async c => {
        const client = baileysClients.get(c.user_id);
        if (client?.user) {
            await supabase.from('campaigns').update({ status: 'Running' }).eq('id', c.id);
            runningCampaigns.set(c.user_id, true);
            processCampaign(c.user_id, c, client, io, () => runningCampaigns.get(c.user_id), supabase);
        }
    });
}, 60000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on port ${PORT}`));
