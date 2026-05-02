const { baileysClients, syncContacts } = require('./whatsapp.js');

module.exports = (io, supabase, runningCampaigns) => {
  const router = require('express').Router();

  router.post('/send-bulk', async (req, res) => {
    const { contacts, messages, userId, media, startIndex, scheduledAt, campaignName } = req.body;
    try {
      const client = baileysClients.get(userId);
      if (!client?.user) return res.status(400).json({ error: 'WhatsApp not connected' });

      if (scheduledAt) {
        const { error } = await supabase.from('campaigns').insert({
          user_id: userId,
          name: campaignName,
          status: 'Scheduled',
          scheduled_at: scheduledAt,
          metadata: { contacts, messages, media }
        });
        return res.json({ status: 'Campaign Scheduled' });
      }

      runningCampaigns.set(userId, true);
      res.json({ status: 'Campaign Started' });

      const { processCampaign } = require('./whatsapp.js');
      await processCampaign(userId, { metadata: { contacts, messages, media }, id: Date.now() }, client, io, () => runningCampaigns.get(userId), supabase);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/pause-campaign', async (req, res) => {
    const { userId } = req.body;
    runningCampaigns.set(userId, false);
    res.json({ status: 'Paused' });
  });

  router.post('/resume-campaign', async (req, res) => {
    const { userId } = req.body;
    runningCampaigns.set(userId, true);
    res.json({ status: 'Resumed' });
  });

  router.post('/stop-campaign', async (req, res) => {
    const { userId } = req.body;
    runningCampaigns.set(userId, false);
    res.json({ status: 'Stopped' });
  });

  router.post('/sync-contacts', async (req, res) => {
    const { userId } = req.body;
    try {
      const client = baileysClients.get(userId);
      if (!client?.user) return res.status(400).json({ error: 'WhatsApp not connected' });
      const count = await syncContacts(userId, client, supabase);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
