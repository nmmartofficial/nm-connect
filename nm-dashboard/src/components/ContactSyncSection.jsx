import React, { useState } from 'react';
import { Users, Upload, RefreshCcw } from 'lucide-react';
import { supabase } from '../supabaseClient';

const ContactSyncSection = ({ userId, onSync, backendUrl }) => {
  const [loading, setLoading] = useState(false);

  const handleDeviceSync = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/sync-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      alert(`Successfully synced ${data.count} contacts from WhatsApp!`);
      if (onSync) onSync();
    } catch (err) {
      alert("Sync failed: " + err.message);
    }
    setLoading(false);
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const rows = text.split('\n').filter(r => r.trim());
      const contacts = rows.slice(1).map(row => {
        const parts = row.split(',');
        return { 
          name: parts[0]?.trim(), 
          number: parts[1]?.replace(/\D/g, '').slice(-10), 
          user_id: userId,
          status: 'Pending'
        };
      }).filter(c => c.number.length === 10);
      
      const { error } = await supabase.from('customers').upsert(contacts, { onConflict: 'number,user_id' });
      if (!error) { 
        alert(`Imported ${contacts.length} contacts!`); 
        if (onSync) onSync(); 
      } else {
        throw error;
      }
    } catch (err) { 
      alert("Import failed: " + err.message); 
    }
    setLoading(false);
  };

  return (
    <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center space-y-6">
      <div className="h-16 w-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto border border-blue-500/20">
        <Users size={32} className="text-blue-500" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-bold text-white">Contact Sync</h3>
        <p className="text-sm text-slate-400 max-w-sm mx-auto">
          Automatically pick mobile numbers from your connected WhatsApp account or upload a CSV file.
        </p>
      </div>
      <div className="flex flex-col md:flex-row gap-4 justify-center pt-4">
        <button 
          onClick={handleDeviceSync} 
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-xl flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <RefreshCcw size={18} />} 
          WhatsApp Sync (Recommended)
        </button>
        <label className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all">
          <Upload size={18} /> Import CSV 
          <input type="file" hidden accept=".csv" onChange={handleFile} disabled={loading} />
        </label>
      </div>
    </div>
  );
};

export default ContactSyncSection;
