import React, { useState, useRef } from 'react';
import { Play, Square, Zap, Upload, ShieldCheck, Clock, RefreshCw } from 'lucide-react';
import { parseExcelContacts } from '../utils/ExcelHelper';

const CampaignControl = ({ isWhatsAppReady, isRunning, onStart, onStop, onImport, USER_ID, BACKEND_URL, onSync }) => {
  const [name, setName] = useState('');
  const [msgA, setMsgA] = useState('');
  const [msgB, setMsgB] = useState('');
  const [msgC, setMsgC] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    try {
      const file = e.target.files[0];
      if (file) {
        const contacts = await parseExcelContacts(file);
        onImport(contacts);
        alert(`✅ ${contacts.length} Contacts Imported Successfully!`);
      }
    } catch (err) { alert("❌ Error reading Excel file."); }
  };

  const handleSyncContacts = async () => {
    if (!USER_ID || !isWhatsAppReady) return alert("Please connect WhatsApp first!");
    setIsSyncing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/sync-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID })
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Synced ${data.count} Mobile Contacts!`);
        onSync();
      } else alert(`❌ Error: ${data.error}`);
    } catch (err) { alert("❌ Sync Failed!"); }
    finally { setIsSyncing(false); }
  };

  const startEngine = () => {
    if (!name.trim() || (!msgA.trim() && !msgB.trim() && !msgC.trim())) {
      return alert("Please enter Campaign Name and at least one Message Variation.");
    }
    onStart({ name, msgA, msgB, msgC });
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
      <div className="p-5 border-b border-slate-800 bg-slate-800/30 flex flex-wrap gap-4 justify-between items-center">
        <div className="flex items-center gap-3"><div className="p-2 bg-yellow-500/10 rounded-lg"><Zap size={18} className="text-yellow-500" /></div><h3 className="font-black text-sm uppercase tracking-tighter">NM Engine V2</h3></div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => fileInputRef.current.click()} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs flex items-center gap-2 border border-slate-700"><Upload size={14} /> Excel</button>
          <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
          <button onClick={handleSyncContacts} disabled={isSyncing || !isWhatsAppReady} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs flex items-center gap-2 border border-slate-700 disabled:opacity-50"><RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} /> {isSyncing ? 'Syncing...' : 'Sync Mobile'}</button>
          {isRunning ? <button onClick={onStop} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-red-500/20"><Square size={14} /> Stop</button> : <button onClick={startEngine} disabled={!isWhatsAppReady} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20"><Play size={14} /> Start</button>}
        </div>
      </div>
      <div className="p-7 space-y-6">
        <input type="text" placeholder="Campaign Identity (e.g. Summer Sale)" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-white outline-none focus:border-blue-500/50" value={name} onChange={e => setName(e.target.value)} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <textarea placeholder="Variation A..." className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs h-32 text-white outline-none resize-none focus:border-blue-500/50" value={msgA} onChange={e => setMsgA(e.target.value)} />
          <textarea placeholder="Variation B..." className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs h-32 text-white outline-none resize-none focus:border-blue-500/50" value={msgB} onChange={e => setMsgB(e.target.value)} />
          <textarea placeholder="Variation C..." className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs h-32 text-white outline-none resize-none focus:border-blue-500/50" value={msgC} onChange={e => setMsgC(e.target.value)} />
        </div>
        <div className="flex items-center gap-6 pt-2 border-t border-slate-800/50">
          <div className="flex items-center gap-2 text-[10px] text-emerald-500 font-medium"><ShieldCheck size={14} /> Anti-Ban Active</div>
          <div className="flex items-center gap-2 text-[10px] text-blue-400 font-medium"><Clock size={14} /> 25-60s Random Delay</div>
        </div>
      </div>
    </div>
  );
};

export default CampaignControl;
