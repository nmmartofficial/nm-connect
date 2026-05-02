const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

/**
 * Handles fetching and verifying mobile contacts via whatsapp-web.js
 */
const syncMobileContacts = async (userId, client, io) => {
    try {
        console.log(`🔍 [SYNC] Starting contact sync for ${userId}...`);
        
        if (!client) {
            throw new Error("WhatsApp client not initialized");
        }

        io.emit(`log_${userId}`, { type: 'info', msg: `📂 Fetching contacts from WhatsApp...` });

        // 1. Fetch contacts from whatsapp-web.js
        const contacts = await client.getContacts();
        
        // 2. Filter for actual users (not groups or broadcasts) and those with a number
        const userContacts = contacts.filter(c => c.isUser && !c.isGroup && !c.isBroadcast && c.number);

        if (!userContacts.length) {
            throw new Error("No contacts found on WhatsApp. Try opening WhatsApp on your phone.");
        }

        io.emit(`log_${userId}`, { type: 'info', msg: `📂 Found ${userContacts.length} contacts. Syncing to database...` });

        const verifiedContacts = userContacts.map(c => ({
            user_id: userId,
            number: c.number,
            name: c.name || c.pushname || 'WhatsApp Contact',
            status: 'Pending'
        }));

        // Process in chunks to avoid Supabase/DB issues with large inserts
        const chunkSize = 100;
        let syncedCount = 0;

        for (let i = 0; i < verifiedContacts.length; i += chunkSize) {
            const chunk = verifiedContacts.slice(i, i + chunkSize);
            const { error } = await supabase.from('customers').upsert(chunk, { onConflict: 'number,user_id' });
            
            if (error) {
                console.error(`💥 [SYNC] Chunk Error:`, error);
                continue;
            }
            syncedCount += chunk.length;
            io.emit(`log_${userId}`, { type: 'info', msg: `⏳ Synced ${syncedCount}/${verifiedContacts.length} contacts...` });
        }

        io.emit(`log_${userId}`, { type: 'success', msg: `✅ Successfully synced ${syncedCount} WhatsApp contacts!` });

        return syncedCount;
    } catch (error) {
        console.error(`💥 [SYNC] Error:`, error.message);
        io.emit(`log_${userId}`, { type: 'error', msg: `❌ Sync Failed: ${error.message}` });
        throw error;
    }
};

module.exports = { syncMobileContacts };
