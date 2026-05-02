import { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';

export const useCampaign = (USER_ID, BACKEND_URL, customers, setCustomers, setLogs, userPlan) => {
  const [isCampaignRunning, setIsCampaignRunning] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState({ current: 0, total: 0, sent: 0, invalid: 0 });
  const abortController = useRef(null);

  const getDelay = () => Math.floor(Math.random() * (60000 - 25000 + 1)) + 25000;

  const startCampaign = async (campaignData) => {
    if (userPlan.isExpired) return alert("Plan Expired!");
    const target = campaignData.selectedIds?.length 
      ? customers.filter(c => campaignData.selectedIds.includes(c.id)) 
      : customers;
    
    if (!target.length) return alert("No contacts selected!");

    setIsCampaignRunning(true);
    abortController.current = new AbortController();
    
    try {
      for (let i = 0; i < target.length; i++) {
        if (!isCampaignRunning) break;
        
        const contact = target[i];
        const variations = [campaignData.msgA, campaignData.msgB, campaignData.msgC].filter(m => m && m.trim());
        const randomMsg = variations[Math.floor(Math.random() * variations.length)] || campaignData.msg;

        const res = await fetch(`${BACKEND_URL}/api/send-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: USER_ID, contact, message: randomMsg }),
          signal: abortController.current.signal
        });

        if (res.ok) {
          setCampaignProgress(p => ({ ...p, sent: p.sent + 1, current: i + 1 }));
          setCustomers(prev => prev.map(c => c.id === contact.id ? { ...c, status: 'Sent' } : c));
          setLogs(prev => [{ type: 'success', msg: `✅ Sent to ${contact.number}`, time: new Date().toLocaleTimeString() }, ...prev]);
        }

        if (i < target.length - 1) {
          const delay = getDelay();
          setLogs(prev => [{ type: 'info', msg: `⏳ Next message in ${Math.round(delay/1000)}s`, time: new Date().toLocaleTimeString() }, ...prev]);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    } catch (e) { 
      if (e.name !== 'AbortError') console.error("Campaign Error:", e);
    } finally {
      setIsCampaignRunning(false);
    }
  };

  const stopCampaign = () => {
    setIsCampaignRunning(false);
    if (abortController.current) abortController.current.abort();
    setLogs(prev => [{ type: 'info', msg: '🛑 Campaign stopped by user', time: new Date().toLocaleTimeString() }, ...prev]);
  };

  return { isCampaignRunning, campaignProgress, startCampaign, stopCampaign };
};
