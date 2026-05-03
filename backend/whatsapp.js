const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser } = require('@whiskeysockets/baileys');
const pino = require('pino'), path = require('path'), qrcode = require('qrcode');

const baileysClients = new Map(), lastQRs = new Map(), isInitializing = new Map();
const qrTimers = new Map();

const handleConn = async (upd, userId, io, client, supabase) => {
    const { connection, lastDisconnect, qr } = upd;
    if (qr) {
        if (!lastQRs.has(userId)) {
            const url = await qrcode.toDataURL(qr);
            lastQRs.set(userId, url);
            io.emit('qr_update', { qr: url, userId });
        }
    }
    if (connection === 'close') {
        baileysClients.delete(userId);
        const shouldRepo = lastDisconnect?.error?.output?.statusCode !== 401;
        if (shouldRepo) initWA(userId, io, supabase);
    } else if (connection === 'open') {
        lastQRs.delete(userId);
        io.emit('whatsapp_ready', { userId, info: client.user });
    }
};

const initWA = async (userId, io, supabase) => {
    if (isInitializing.get(userId) || baileysClients.get(userId)) return;
    isInitializing.set(userId, true);
    try {
        const { state, saveCreds } = await useMultiFileAuthState(`./auth_info_baileys/${userId}`);
        const { version } = await fetchLatestBaileysVersion();
        const client = makeWASocket({ version, auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) }, printQRInTerminal: false, logger: pino({ level: 'silent' }), browser: ["NM MART", "Chrome", "1.0.0"] });
        baileysClients.set(userId, client);
        client.ev.on('creds.update', saveCreds);
        client.ev.on('connection.update', (upd) => handleConn(upd, userId, io, client, supabase));
        client.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const m of messages) {
                if (!m.message || m.key.fromMe) continue;
                const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
                const { data } = await supabase.from('auto_responses').select('response').eq('user_id', userId).ilike('keyword', text.trim()).single();
                if (data) await client.sendMessage(m.key.remoteJid, { text: data.response });
            }
        });
    } catch (e) { console.error('WA Init Error:', e.message); } finally { isInitializing.set(userId, false); }
};

const processCampaign = async (userId, camp, client, io, isRunning, supabase) => {
    const { contacts, messages, media } = camp.metadata;
    let sent = 0, invalid = 0;
    const MAX_RETRIES = 2;
    
    for (let i = 0; i < contacts.length; i++) {
        if (!isRunning()) break;
        let success = false;
        let retries = 0;
        
        while (!success && retries <= MAX_RETRIES) {
            try {
                const jid = contacts[i].number.replace(/\D/g, '') + '@s.whatsapp.net';
                let msg = messages[Math.floor(Math.random() * messages.length)];
                
                msg = msg.replace(/{name}/g, contacts[i].name || '');
                msg = msg.replace(/{company}/g, contacts[i].company || '');
                msg = msg.replace(/{city}/g, contacts[i].city || '');
                msg = msg.replace(/{email}/g, contacts[i].email || '');
                msg = msg.replace(/{phone}/g, contacts[i].number || '');
                
                await client.sendPresenceUpdate('composing', jid);
                await client.sendMessage(jid, { text: msg });
                await client.sendPresenceUpdate('paused', jid);
                sent++;
                await supabase.from('customers').update({ status: 'Sent' }).eq('id', contacts[i].id);
                success = true;
            } catch (e) { 
                retries++;
                if (retries > MAX_RETRIES) {
                    invalid++;
                } else {
                    await new Promise(r => setTimeout(r, 5000));
                }
            }
        }
        
        await supabase.from('campaigns').update({ sent_count: sent, invalid_count: invalid }).eq('id', camp.id);
        io.emit(`log_${userId}`, { 
            type: success ? 'success' : 'error', 
            msg: success ? undefined : 'Failed to send message after multiple attempts',
            sentContactId: success ? contacts[i].id : undefined,
            progress: { current: i + 1, total: contacts.length, sent, invalid, lastIndex: i } 
        });
        
        const baseInterval = 49000;
        const randomVariation = Math.random() * 40000 - 20000;
        const finalInterval = Math.max(30000, Math.min(70000, baseInterval + randomVariation));
        await new Promise(r => setTimeout(r, finalInterval));
    }
    await supabase.from('campaigns').update({ status: 'Completed' }).eq('id', camp.id);
};

const syncContacts = async (userId, client, supabase) => {
    const contacts = await client.store?.contacts || {};
    const list = Object.values(contacts).map(c => ({ user_id: userId, number: c.id.split('@')[0], name: c.name || c.notify || c.verifiedName || 'Unknown' }));
    if (list.length) await supabase.from('customers').upsert(list, { onConflict: 'user_id,number' });
    return list.length;
};

module.exports = { initWA, baileysClients, lastQRs, processCampaign, syncContacts };
