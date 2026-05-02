const supabase = require('./supabaseClient');
const { randomDelay, formatNumber, getProfessionalClosing } = require('./utils');

const processCampaign = async (userId, campaign, client, io, isRunning) => {
    const contacts = campaign.contacts || campaign.metadata?.contacts || [];
    const messages = campaign.messages || campaign.metadata?.messages || [];
    if (!contacts.length || !messages.length) return;

    const startIndex = campaign.sent_count || 0;
    const { data: user } = await supabase.from('users').select('business_name').eq('id', userId).single();
    const bizName = user?.business_name || "Our Store";

    let count = startIndex;
    for (const contact of contacts.slice(startIndex)) {
        if (!isRunning()) break;
        try {
            const msg = messages[Math.floor(Math.random() * messages.length)];
            await client.sendMessage(formatNumber(contact.number), { text: `${msg}${getProfessionalClosing(bizName)}` });
            count++;
            console.log(`✅ [Campaign] Sent successfully to ${contact.number} (${count}/${contacts.length})`); // Terminal Log for Shadab
            await supabase.from('campaigns').update({ sent_count: count }).eq('id', campaign.id);
            io.emit(`log_${userId}`, { 
                type: 'info', 
                msg: `✅ Sent to ${contact.number} (${count}/${contacts.length})`,
                progress: { sent: count, total: contacts.length, current: count } 
            });
            await randomDelay(5000, 10000);
        } catch (err) { console.error(`❌ Send Error:`, err.message); }
    }
    if (count >= contacts.length) {
        await supabase.from('campaigns').update({ status: 'Completed' }).eq('id', campaign.id);
        io.emit(`log_${userId}`, { type: 'success', msg: `🏁 Campaign "${campaign.name}" Completed!` });
    }
};

module.exports = { processCampaign };
