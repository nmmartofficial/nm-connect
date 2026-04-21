import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient';
import { io } from 'socket.io-client';
import { 
  Users, Send, TrendingUp, Upload, Database, 
  Search, Filter, Phone, MessageSquare, ShieldCheck, Zap, 
  ListChecks, Clock, XCircle, Trash2, RefreshCcw, Image as ImageIcon, LogOut, Menu, X,
  CheckCircle2, AlertCircle, History as HistoryIcon, LayoutDashboard, Settings
} from 'lucide-react';
import * as XLSX from 'xlsx';
import SessionManager from './SessionManager'; 
import Login from './components/Login';

// --- LOCAL/PRODUCTION AUTO-DETECT ---
const BACKEND_URL = window.location.hostname === 'localhost' ? "http://localhost:3001" : (import.meta.env.VITE_BACKEND_URL || "https://nm-connect-backend.onrender.com");
console.log("📍 API Backend URL in use:", BACKEND_URL);

export default function App() {
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [logs, setLogs] = useState([]);
  const [isWhatsAppReady, setIsWhatsAppReady] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [messageVariations, setMessageVariations] = useState({ A: '' });
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [stats, setStats] = useState({ total: 0, sent: 0, pending: 0 });

  const socket = useMemo(() => io(BACKEND_URL, {
    transports: ['polling', 'websocket'],
    reconnection: true,
  }), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("Current session:", session);
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("Auth state changed:", session);
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const USER_ID = session?.user?.id;

  const fetchCustomers = async () => {
    if (!USER_ID) return;
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', USER_ID)
      .order('created_at', { ascending: false });
    
    if (!error) {
      setCustomers(data);
      const sent = data.filter(c => c.status === 'Sent').length;
      setStats({
        total: data.length,
        sent: sent,
        pending: data.length - sent
      });
    }
  };

  useEffect(() => {
    if (!USER_ID) return;
    fetchCustomers();
    
    socket.on('connect', () => {
      console.log("🟢 Socket Connected, requesting session...");
      socket.emit('request_session', USER_ID);
    });

    socket.on(`ready_${USER_ID}`, () => setIsWhatsAppReady(true));
    socket.on(`disconnected_${USER_ID}`, () => setIsWhatsAppReady(false));
    
    socket.on(`log_${USER_ID}`, (newLog) => {
      console.log("📝 Received log via user event:", newLog);
      setLogs(prev => [{ ...newLog, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
      if (newLog.type === 'success') {
          fetchCustomers();
      }
    });

    socket.on('campaign_log', (newLog) => {
      console.log("📝 Received log via campaign_log event:", newLog);
      setLogs(prev => [{ ...newLog, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
      fetchCustomers();
    });

    return () => {
      socket.off(`ready_${USER_ID}`);
      socket.off(`disconnected_${USER_ID}`);
      socket.off(`log_${USER_ID}`);
      socket.off('connect');
    };
  }, [USER_ID, socket]);

  const triggerCampaign = async (mode) => {
    let targetList = mode === 'RESUME' ? customers.filter(c => c.status !== 'Sent') : customers;
    
    if (targetList.length === 0) return alert("No numbers to send!");
    if (!messageVariations.A.trim()) return alert("Please enter a message!");

    try {
      setLoading(true);
      
      let mediaData = null;
      if (selectedMedia) {
        mediaData = {
          data: selectedMedia.data,
          mimetype: selectedMedia.mimetype,
          filename: selectedMedia.filename
        };
      }

      const response = await fetch(`${BACKEND_URL}/api/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contacts: targetList, 
          messages: [messageVariations.A], 
          userId: USER_ID,
          media: mediaData
        })
      });
      if (response.ok) {
          setLogs(prev => [{ type: 'info', msg: 'Campaign started...', time: new Date().toLocaleTimeString() }, ...prev]);
      }
    } catch (err) {
      alert("Backend connection error!");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      
      const normalizedData = data.map(row => ({
        name: row.Name || row.name || 'Customer',
        number: String(row.Number || row.number || row.Phone || '').replace(/\D/g, ''),
        status: 'Pending',
        user_id: USER_ID
      })).filter(i => i.number.length >= 10);

      const { error } = await supabase.from('customers').insert(normalizedData);
      if (!error) fetchCustomers();
      else alert("Error uploading data!");
    };
    reader.readAsBinaryString(file);
  };

  const handleMediaUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64Data = evt.target.result.split(',')[1];
      setSelectedMedia({
        data: base64Data,
        mimetype: file.type,
        filename: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const deleteData = async () => {
    if (!window.confirm("Delete all customers?")) return;
    const { error } = await supabase.from('customers').delete().eq('user_id', USER_ID);
    if (!error) fetchCustomers();
  };

  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.number?.toString().includes(searchTerm)
  );

  if (!session) return <Login onLoginSuccess={(user) => setSession({ user })} />;

  return (
    <div className="h-screen bg-slate-950 text-slate-200 flex flex-col md:flex-row w-full overflow-hidden font-sans">
      
      {/* SIDEBAR */}
      <div className={`fixed md:relative z-[100] md:z-auto h-full w-72 bg-slate-900 border-r border-slate-800 p-6 flex flex-col transform transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2">
                <Zap size={24} className="text-blue-500" fill="currentColor"/>
                <h1 className="text-xl font-black italic uppercase tracking-tighter text-white">NM CONNECT</h1>
            </div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-slate-400"><X size={24}/></button>
        </div>

        <SessionManager userId={USER_ID} socket={socket} onStatusChange={setIsWhatsAppReady} />

        <nav className="space-y-2 mt-8 flex-1">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
            <LayoutDashboard size={18}/> Dashboard
          </button>
          <button onClick={() => setActiveTab('history')} className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
            <HistoryIcon size={18}/> Campaign History
          </button>
        </nav>

        <div className="pt-6 border-t border-slate-800">
             <button onClick={() => supabase.auth.signOut()} className="w-full flex items-center gap-3 p-3 text-slate-500 hover:text-red-400 rounded-xl font-bold transition-colors">
                <LogOut size={18}/> Logout
             </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* TOPBAR */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md">
            <div className="md:hidden">
                <button onClick={() => setIsMobileMenuOpen(true)}><Menu size={24}/></button>
            </div>
            <div className="flex items-center gap-4 ml-auto">
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full border border-slate-700">
                    <div className={`h-2 w-2 rounded-full ${isWhatsAppReady ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
                    <span className="text-[10px] font-bold uppercase tracking-wider">{isWhatsAppReady ? 'WhatsApp Connected' : 'Disconnected'}</span>
                </div>
            </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === 'dashboard' ? (
                <>
                    {/* STATS CARDS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
                            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500"><Users size={24}/></div>
                            <div>
                                <p className="text-slate-500 text-xs font-bold uppercase">Total Contacts</p>
                                <p className="text-2xl font-black">{stats.total}</p>
                            </div>
                        </div>
                        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
                            <div className="p-3 bg-green-500/10 rounded-xl text-green-500"><CheckCircle2 size={24}/></div>
                            <div>
                                <p className="text-slate-500 text-xs font-bold uppercase">Sent Successfully</p>
                                <p className="text-2xl font-black text-green-500">{stats.sent}</p>
                            </div>
                        </div>
                        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
                            <div className="p-3 bg-orange-500/10 rounded-xl text-orange-500"><Clock size={24}/></div>
                            <div>
                                <p className="text-slate-500 text-xs font-bold uppercase">Pending</p>
                                <p className="text-2xl font-black text-orange-500">{stats.pending}</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* LEFT: CAMPAIGN CONTROL */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                                <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
                                    <h3 className="font-bold flex items-center gap-2"><MessageSquare size={18} className="text-blue-500"/> Campaign Settings</h3>
                                    <div className="flex gap-2">
                                        <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all border border-slate-700">
                                            <ImageIcon size={14}/> {selectedMedia ? selectedMedia.filename : 'Add Media'}
                                            <input type="file" className="hidden" onChange={handleMediaUpload} accept="image/*,application/pdf" />
                                        </label>
                                        <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all">
                                            <Upload size={14}/> Import Excel
                                            <input type="file" className="hidden" onChange={handleFileUpload} accept=".xlsx,.xls" />
                                        </label>
                                        <button onClick={deleteData} className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-all"><Trash2 size={18}/></button>
                                    </div>
                                </div>
                                <div className="p-6 space-y-4">
                                    <textarea 
                                        value={messageVariations.A} 
                                        onChange={(e) => setMessageVariations({ A: e.target.value })} 
                                        placeholder="Type your WhatsApp message here... (Use {name} to personalize)" 
                                        className="w-full h-48 bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-300 focus:border-blue-500 outline-none transition-all resize-none"
                                    />
                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => triggerCampaign('RESUME')} 
                                            disabled={loading || !isWhatsAppReady}
                                            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20"
                                        >
                                            {loading ? 'Processing...' : 'Start / Resume Campaign'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* CONTACTS LIST */}
                            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                                <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex items-center gap-4">
                                    <h3 className="font-bold flex items-center gap-2 min-w-fit"><Users size={18} className="text-blue-500"/> Contacts</h3>
                                    <div className="relative flex-1 max-w-xs">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14}/>
                                        <input 
                                            type="text" 
                                            placeholder="Search contacts..." 
                                            className="w-full bg-slate-950 border border-slate-800 pl-9 pr-4 py-2 rounded-lg text-xs"
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="max-h-[400px] overflow-y-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-950/50 sticky top-0 text-[10px] uppercase text-slate-500 font-bold tracking-widest border-b border-slate-800">
                                            <tr>
                                                <th className="p-4">Customer Name</th>
                                                <th className="p-4">Phone Number</th>
                                                <th className="p-4 text-right">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {filteredCustomers.length > 0 ? filteredCustomers.map((c, i) => (
                                                <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                                                    <td className="p-4 font-medium">{c.name}</td>
                                                    <td className="p-4 text-slate-400">+{c.number}</td>
                                                    <td className="p-4 text-right">
                                                        <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${
                                                            c.status === 'Sent' ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'
                                                        }`}>
                                                            {c.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            )) : (
                                                <tr>
                                                    <td colSpan="3" className="p-8 text-center text-slate-500 text-sm">No contacts found. Upload an Excel file to start.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: LIVE LOGS */}
                        <div className="bg-slate-900 rounded-2xl border border-slate-800 flex flex-col h-full min-h-[500px]">
                            <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
                                <h3 className="font-bold flex items-center gap-2"><Clock size={18} className="text-blue-500"/> Live Activity</h3>
                                <button onClick={() => setLogs([])} className="text-[10px] text-slate-500 hover:text-slate-300 font-bold uppercase tracking-widest">Clear</button>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-[11px]">
                                {logs.length > 0 ? logs.map((log, i) => (
                                    <div key={i} className={`p-3 rounded-lg border ${
                                        log.type === 'success' ? 'bg-green-500/5 border-green-500/10 text-green-400' : 
                                        log.type === 'error' ? 'bg-red-500/5 border-red-500/10 text-red-400' : 
                                        'bg-blue-500/5 border-blue-500/10 text-blue-400'
                                    }`}>
                                        <span className="opacity-50 mr-2">[{log.time}]</span>
                                        {log.msg}
                                    </div>
                                )) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2 italic">
                                        <AlertCircle size={32} opacity={0.2}/>
                                        <p>No activity logs yet...</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                /* HISTORY TAB */
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col items-center justify-center space-y-4">
                            <HistoryIcon size={48} className="text-blue-500"/>
                            <h2 className="text-xl font-bold">Campaign Performance</h2>
                            <div className="w-full space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Success Rate</span>
                                    <span className="text-green-500 font-bold">
                                        {stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0}%
                                    </span>
                                </div>
                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                    <div 
                                        className="bg-green-500 h-full transition-all duration-1000" 
                                        style={{ width: `${stats.total > 0 ? (stats.sent / stats.total) * 100 : 0}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
                             <h3 className="font-bold mb-4 flex items-center gap-2"><ListChecks size={18} className="text-blue-500"/> Campaign Summary</h3>
                             <div className="space-y-3">
                                <div className="flex justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                                    <span className="text-slate-400">Total Contacts</span>
                                    <span className="font-bold">{stats.total}</span>
                                </div>
                                <div className="flex justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                                    <span className="text-slate-400">Successfully Sent</span>
                                    <span className="font-bold text-green-500">{stats.sent}</span>
                                </div>
                                <div className="flex justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                                    <span className="text-slate-400">Pending / Failed</span>
                                    <span className="font-bold text-orange-500">{stats.pending}</span>
                                </div>
                             </div>
                        </div>
                    </div>

                    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
                            <h3 className="font-bold">Detailed Activity Log</h3>
                            <button onClick={() => setLogs([])} className="text-xs text-slate-500 hover:text-slate-300">Clear Logs</button>
                        </div>
                        <div className="p-4 max-h-[400px] overflow-y-auto space-y-2">
                            {logs.map((log, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono">
                                    <span className="text-slate-600">[{log.time}]</span>
                                    <span className={log.type === 'success' ? 'text-green-500' : log.type === 'error' ? 'text-red-500' : 'text-blue-500'}>
                                        {log.msg}
                                    </span>
                                </div>
                            ))}
                            {logs.length === 0 && <p className="text-center text-slate-500 py-8">No recent activity logs.</p>}
                        </div>
                    </div>
                </div>
            )}
        </main>
      </div>
    </div>
  );
}
