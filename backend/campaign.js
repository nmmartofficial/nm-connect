import { createClient } from '@supabase/supabase-js';

// --- SUPABASE CONNECTION ---
const supabaseUrl = 'https://riinnhpjxmmywmcvkiqd.supabase.co';
const supabaseKey = 'sb_publishable_IxXjjNJYFpS-7q09_6zCjg_mAMF14lu';
const supabase = createClient(supabaseUrl, supabaseKey);

export const handleBulkSend = async (req, res, userClients, io) => {
    const { contacts, messages, imageData, userId } = req.body;
    
    // 1. Check karega ki kya specific user connected hai aur ready hai
    const client = userClients[userId];

    // Basic check + Ready check (whatsapp-web.js internal state check)
    if (!client || !client.pupPage) {
        console.log(`❌ Connection Error: WhatsApp session for ${userId} is not active or crashed.`);
        io.emit(`log_${userId}`, { 
            type: 'error', 
            msg: `WhatsApp disconnected! Please refresh and scan again.` 
        });
        return res.status(400).send({ error: `WhatsApp not ready for ${userId}` });
    }

    // 2. Response turant bhej do taaki frontend "Running" dikhaye
    res.send({ status: 'Campaign Started' });

    // 3. Loop through contacts
    for (const [index, contact] of contacts.entries()) {
        try {
            // Re-verify client health inside loop (in case it crashes mid-campaign)
            if (!client.pupPage) {
                throw new Error('Browser session lost mid-campaign');
            }

            // Number format fix: @c.us lagana zaroori hai
            const chatId = contact.number.includes('@c.us') ? contact.number : `${contact.number}@c.us`;
            
            // --- MODULE 2: VARIABLE PARSING & AI SPINNING ---
            // Pick a message from the variations (rotating)
            const baseMessage = messages[index % messages.length];
            
            // Replace {name}, {var1}, {var2} etc based on keys in the contact object
            let personalizedMsg = baseMessage;
            Object.keys(contact).forEach(key => {
                personalizedMsg = personalizedMsg.replace(new RegExp(`{${key}}`, 'g'), contact[key] || '');
            });

            // --- SENDING LOGIC ---
            if (imageData) {
                const { default: pkg } = await import('whatsapp-web.js');
                const { MessageMedia } = pkg;
                const media = new MessageMedia('image/png', imageData.split(',')[1]);
                await client.sendMessage(chatId, media, { caption: personalizedMsg });
            } else {
                await client.sendMessage(chatId, personalizedMsg);
            }

            // Database status update
            await supabase
                .from('customers')
                .update({ status: 'Sent' })
                .eq('number', contact.number)
                .eq('user_id', userId);
            
            io.emit(`log_${userId}`, { 
                type: 'success', 
                msg: `Sent to ${contact.name || contact.number} ✅` 
            });

            // --- MODULE: SAFE MODE RANDOM DELAY (20-45 SECONDS) ---
            // Formula: Math.random() * (max - min) + min
            const safeDelay = Math.floor(Math.random() * (45000 - 20000 + 1)) + 20000;
            
            console.log(`⏳ Safe Mode: Waiting ${Math.round(safeDelay/1000)} seconds before next message...`);
            
            await new Promise(res => setTimeout(res, safeDelay));
            
        } catch (err) {
            console.error(`❌ Error for ${contact.number}:`, err.message);
            io.emit(`log_${userId}`, { 
                type: 'error', 
                msg: `Failed for ${contact.name || contact.number}` 
            });

            if (err.message.includes('evaluate') || err.message.includes('session lost')) {
                break; 
            }
        }
    }
    
    console.log(`✅ Campaign Finished for User: ${userId}`);
    io.emit(`campaign-finished_${userId}`);
};