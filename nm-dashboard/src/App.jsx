import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient';
import { io } from 'socket.io-client';
import { 
  Users, Send, TrendingUp, Upload, Database, 
  Search, Filter, Phone, MessageSquare, ShieldCheck, Zap, 
  ListChecks, Clock, XCircle, Trash2, RefreshCcw, Image as ImageIcon, LogOut, Menu, X,
  CheckCircle2, AlertCircle, History as HistoryIcon, LayoutDashboard, Settings, CreditCard, Star, Crown, Bot, Plus
} from 'lucide-react';
import * as XLSX from 'xlsx';
import SessionManager from './SessionManager'; 
import Login from './components/Login';

// --- LOCAL/PRODUCTION AUTO-DETECT ---
const BACKEND_URL = window.location.hostname === 'localhost' ? "http://localhost:3001" : (import.meta.env.VITE_BACKEND_URL || "https://nm-connect.onrender.com");
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
  const [messageVariations, setMessageVariations] = useState(() => {
    const saved = localStorage.getItem('messageVariations');
    return saved ? JSON.parse(saved) : { A: '', B: '', C: '' };
  });
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [scheduledTime, setScheduledTime] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [campaignHistory, setCampaignHistory] = useState([]);
  const [stats, setStats] = useState({ total: 0, sent: 0, pending: 0, invalid: 0 });
  const [autoResponses, setAutoResponses] = useState([]);
  const [newAutoResponse, setNewAutoResponse] = useState({ keyword: '', response: '' });
  const [selectedIds, setSelectedIds] = useState([]);
  const [userPlan, setUserPlan] = useState({ name: 'Free', limit: 50 }); // Initial state
  const [showPaymentModal, setShowPaymentModal] = useState(null); // { plan, price }
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', number: '' });
  const [campaignProgress, setCampaignProgress] = useState(() => {
    const saved = localStorage.getItem('campaignProgress');
    return saved ? JSON.parse(saved) : { current: 0, total: 0, sent: 0, invalid: 0, lastIndex: -1 };
  });

  const [activeCampaignId, setActiveCampaignId] = useState(() => {
    return localStorage.getItem('activeCampaignId') || null;
  });

  // Persist progress to local storage
  useEffect(() => {
    localStorage.setItem('campaignProgress', JSON.stringify(campaignProgress));
  }, [campaignProgress]);

  useEffect(() => {
    if (activeCampaignId) {
      localStorage.setItem('activeCampaignId', activeCampaignId);
    } else {
      localStorage.removeItem('activeCampaignId');
    }
  }, [activeCampaignId]);

  const socket = useMemo(() => io(BACKEND_URL, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    withCredentials: true,
    extraHeaders: {
      "my-custom-header": "abcd"
    }
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

  const fetchAutoResponses = async () => {
    if (!USER_ID) return;
    const { data, error } = await supabase
      .from('auto_responses')
      .select('*')
      .eq('user_id', USER_ID);
    if (!error) setAutoResponses(data);
  };

  const addAutoResponse = async () => {
    if (!newAutoResponse.keyword || !newAutoResponse.response) return;
    const { error } = await supabase
      .from('auto_responses')
      .insert([{ ...newAutoResponse, user_id: USER_ID }]);
    if (!error) {
      setNewAutoResponse({ keyword: '', response: '' });
      fetchAutoResponses();
    }
  };

  const deleteAutoResponse = async (id) => {
    const { error } = await supabase.from('auto_responses').delete().eq('id', id);
    if (!error) fetchAutoResponses();
  };

  const fetchCampaignHistory = async () => {
    if (!USER_ID) return;
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', USER_ID)
      .order('created_at', { ascending: false });
    if (!error) setCampaignHistory(data);
  };

  const fetchUserPlan = async () => {
    if (!USER_ID || !session?.user?.email) return;
    
    const userEmail = session.user.email.toLowerCase().trim();
    const isAdmin = userEmail === 'nmmart07@gmail.com' || userEmail === 'abduls9125@gmail.com' || USER_ID === '56733041-8c04-4a55-bb82-8030e739297d';

    if (isAdmin) {
      setUserPlan({ name: 'Enterprise', limit: 999999 });
      return;
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', USER_ID)
      .single();
    
    if (!error && data) {
      if (data.plan_name === 'Trial') {
        const now = new Date();
        const expiry = new Date(data.trial_expires_at);
        if (now > expiry) {
          setUserPlan({ name: 'Free', limit: 50 });
        } else {
          const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
          setUserPlan({ name: `Free Trial (${daysLeft} days left)`, limit: data.daily_limit || 100 });
        }
      } else {
        setUserPlan({ name: data.plan_name, limit: data.daily_limit });
      }
    }
  };

  const handlePurchase = async (planName, price, limit) => {
    setShowPaymentModal({ plan: planName, price, limit });
  };

  const confirmPaymentRequest = async (planName, price, limit) => {
    setLoading(true);
    try {
      // 1. Log payment request in Supabase
      const { error: logError } = await supabase
        .from('payment_requests')
        .insert([{ 
            user_id: USER_ID, 
            plan_name: planName, 
            amount: price,
            status: 'Pending'
        }]);

      if (!logError) {
        alert(`Payment details sent! Please complete the payment. Admin will upgrade your plan shortly.`);
        setShowPaymentModal(null);
      } else {
        alert("Failed to send payment request.");
      }
    } catch (err) {
      alert("Error processing request.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!USER_ID) return;
    fetchCustomers();
    fetchAutoResponses();
    fetchCampaignHistory();
    fetchUserPlan();
    
    socket.on('connect', () => {
      console.log("🟢 Socket Connected, requesting session...");
      socket.emit('request_session', USER_ID);
    });

    socket.on(`ready_${USER_ID}`, () => setIsWhatsAppReady(true));
    socket.on(`disconnected_${USER_ID}`, () => setIsWhatsAppReady(false));
    
    socket.on(`log_${USER_ID}`, (newLog) => {
      console.log("📝 Received log via user event:", newLog);
      
      if (newLog.progress) {
        setCampaignProgress(newLog.progress);
      }

      if (newLog.msg && newLog.msg.includes('🏁 Campaign finished!')) {
        setActiveCampaignId(null);
        setCampaignProgress({ current: 0, total: 0, sent: 0, invalid: 0, lastIndex: -1 });
      }

      setLogs(prev => [{ ...newLog, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
      if (newLog.type === 'success' || newLog.type === 'error') {
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

  const handleMessageChange = (key, value) => {
    setMessageVariations(prev => {
      const updated = { ...prev, [key]: value };
      localStorage.setItem('messageVariations', JSON.stringify(updated));
      return updated;
    });
  };

  const [pollData, setPollData] = useState({ question: '', options: ['', ''] });

  const handlePollChange = (field, value, index = null) => {
    if (field === 'options') {
      const newOptions = [...pollData.options];
      newOptions[index] = value;
      setPollData({ ...pollData, options: newOptions });
    } else {
      setPollData({ ...pollData, [field]: value });
    }
  };

  const addPollOption = () => {
    if (pollData.options.length < 5) {
      setPollData({ ...pollData, options: [...pollData.options, ''] });
    }
  };

  const triggerCampaign = async (startIndex = 0) => {
    let targetList = customers;
    
    // If user has selected specific contacts, only send to those
    if (selectedIds.length > 0) {
        targetList = customers.filter(c => selectedIds.includes(c.id));
    }

    if (targetList.length === 0) return alert("No numbers to send!");
    
    const activeMessages = Object.values(messageVariations).filter(m => m.trim() !== "");
    if (activeMessages.length === 0) return alert("Please enter at least one message variation!");

    console.log(`🌐 Triggering campaign at: ${BACKEND_URL}/api/send-bulk`);

    try {
      setLoading(true);
      if (startIndex === 0) {
        setCampaignProgress({ current: 0, total: targetList.length, sent: 0, invalid: 0, lastIndex: -1 });
      }
      
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
          messages: activeMessages, // Sending all active variations
          userId: USER_ID,
          userEmail: session?.user?.email, 
          media: mediaData,
          poll: pollData.question ? pollData : null, // Sending poll if exists
          startIndex: startIndex,
          scheduledAt: scheduledTime || null,
          campaignName: campaignName || `Campaign ${new Date().toLocaleDateString()}`,
          campaignId: startIndex > 0 ? activeCampaignId : null
        })
      });
      const result = await response.json();
      console.log(`📡 Campaign Response status: ${response.status}`, result);
      
      if (response.ok) {
          if (result.campaignId) {
            setActiveCampaignId(result.campaignId);
          }
          const statusMsg = scheduledTime ? `Campaign scheduled for ${new Date(scheduledTime).toLocaleString()}...` : `Campaign started from index ${startIndex} (${targetList.length} contacts)...`;
          setLogs(prev => [{ type: 'info', msg: statusMsg, time: new Date().toLocaleTimeString() }, ...prev]);
          if (scheduledTime) setScheduledTime(''); // Reset after scheduling
          setCampaignName(''); // Reset
          fetchCampaignHistory();
      } else {
        alert(result.error || "Failed to start campaign");
      }
    } catch (err) {
      console.error(`❌ Campaign Error:`, err);
      alert("Backend connection error!");
    } finally {
      setLoading(false);
    }
  };

  const stopCampaign = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/stop-campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID })
      });
      if (response.ok) {
        setLogs(prev => [{ type: 'info', msg: 'Stopping campaign...', time: new Date().toLocaleTimeString() }, ...prev]);
      }
    } catch (err) {
      alert("Failed to stop campaign!");
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

  const deleteCustomer = async (id) => {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (!error) {
        fetchCustomers();
        setLogs(prev => [{ type: 'info', msg: `Customer removed from list`, time: new Date().toLocaleTimeString() }, ...prev]);
    } else {
        alert("Error deleting customer!");
    }
  };

  const handleAddSingleContact = async (e) => {
    e.preventDefault();
    if (!newContact.number || newContact.number.length < 10) {
      alert("Please enter a valid 10-digit number");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from('customers').insert([{
      name: newContact.name || 'Customer',
      number: newContact.number.replace(/\D/g, ''),
      status: 'Pending',
      user_id: USER_ID
    }]);

    if (!error) {
      setNewContact({ name: '', number: '' });
      setShowAddContactModal(false);
      fetchCustomers();
      setLogs(prev => [{ type: 'success', msg: `New contact added: ${newContact.number}`, time: new Date().toLocaleTimeString() }, ...prev]);
    } else {
      alert("Error adding contact: " + error.message);
    }
    setLoading(false);
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

        <SessionManager 
          userId={USER_ID} 
          socket={socket} 
          backendUrl={BACKEND_URL}
          onStatusChange={setIsWhatsAppReady} 
        />

        <nav className="space-y-2 mt-8 flex-1">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
            <LayoutDashboard size={18}/> Dashboard
          </button>
          <button onClick={() => setActiveTab('history')} className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
            <HistoryIcon size={18}/> Campaign History
          </button>
          
          <div className="relative group">
            <button 
                onClick={() => userPlan.name === 'Gold' || userPlan.name === 'Enterprise' ? setActiveTab('bot') : setActiveTab('billing')} 
                className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'bot' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}
            >
                <Bot size={18}/> AI Auto-Responder
                {(userPlan.name !== 'Gold' && userPlan.name !== 'Enterprise') && <Crown size={12} className="ml-auto text-orange-500"/>}
                {(userPlan.name === 'Gold' || userPlan.name === 'Enterprise') && <div className="ml-auto h-2 w-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>}
            </button>
          </div>

          <button onClick={() => setActiveTab('billing')} className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'billing' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
            <CreditCard size={18}/> Pricing & Plans
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
                <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-blue-500/10 rounded-full border border-blue-500/20">
                    <Crown size={14} className="text-blue-500"/>
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-500">{userPlan.name} Plan</span>
                </div>
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
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
                            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500"><Users size={24}/></div>
                            <div>
                                <p className="text-slate-500 text-xs font-bold uppercase">Total</p>
                                <p className="text-2xl font-black">{stats.total}</p>
                            </div>
                        </div>
                        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
                            <div className="p-3 bg-green-500/10 rounded-xl text-green-500"><CheckCircle2 size={24}/></div>
                            <div>
                                <p className="text-slate-500 text-xs font-bold uppercase">Sent</p>
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
                        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
                            <div className="p-3 bg-red-500/10 rounded-xl text-red-500"><XCircle size={24}/></div>
                            <div>
                                <p className="text-slate-500 text-xs font-bold uppercase">Invalid Removed</p>
                                <p className="text-2xl font-black text-red-500">{campaignProgress.invalid}</p>
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
                                        <div className="relative group">
                                            <label className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all border ${userPlan.name !== 'Monthly' && userPlan.name !== 'Free' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-slate-900 text-slate-600 border-slate-800 opacity-50 cursor-not-allowed'}`}>
                                                <ImageIcon size={14}/> {selectedMedia ? selectedMedia.filename : 'Add Media'}
                                                <input 
                                                    type="file" 
                                                    disabled={userPlan.name === 'Monthly' || userPlan.name === 'Free'}
                                                    className="hidden" 
                                                    onChange={handleMediaUpload} 
                                                    accept="image/*,application/pdf" 
                                                />
                                            </label>
                                            {(userPlan.name === 'Monthly' || userPlan.name === 'Free') && (
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-blue-600 text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow-xl whitespace-nowrap">
                                                    Yearly Plans Only
                                                </div>
                                            )}
                                        </div>
                                            <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all">
                                            <Upload size={14}/> Import Excel
                                            <input type="file" className="hidden" onChange={handleFileUpload} accept=".xlsx,.xls" />
                                        </label>
                                        <button 
                                            onClick={() => setShowAddContactModal(true)}
                                            className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all border border-slate-700"
                                        >
                                            <Users size={14}/> Add Contact
                                        </button>
                                        <button onClick={deleteData} className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-all"><Trash2 size={18}/></button>
                                    </div>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">
                                            <Settings size={14}/> Campaign Name
                                        </div>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. Eid Offer 2024" 
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs outline-none focus:border-blue-500 transition-all"
                                            value={campaignName}
                                            onChange={(e) => setCampaignName(e.target.value)}
                                        />
                                    </div>

                                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                        <span>Message Templates (A/B/C Rotation)</span>
                                        <span className="text-blue-500 lowercase normal-case italic">Rotates variations to bypass AI filters</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        {['A', 'B', 'C'].map((label) => (
                                            <div key={label} className="space-y-2 group">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black uppercase text-slate-600 group-hover:text-blue-500 transition-colors">
                                                        Variation {label}
                                                    </span>
                                                    {label === 'A' && <span className="text-[8px] text-blue-500 font-bold uppercase">Primary</span>}
                                                </div>
                                                <textarea 
                                                    value={messageVariations[label]} 
                                                    onChange={(e) => handleMessageChange(label, e.target.value)} 
                                                    placeholder={label === 'A' ? "Message A..." : `Optional ${label}...`} 
                                                    className={`w-full h-32 bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-300 focus:border-blue-500 outline-none transition-all resize-none text-[11px] leading-relaxed ${!messageVariations[label] && label !== 'A' ? 'opacity-50 hover:opacity-100' : ''}`}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {/* PROGRESS BAR */}
                                    {campaignProgress.total > 0 && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
                                                <span>Progress: {campaignProgress.current} / {campaignProgress.total}</span>
                                                <span>{Math.round((campaignProgress.current / campaignProgress.total) * 100)}%</span>
                                            </div>
                                            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                                                <div 
                                                    className="h-full bg-blue-600 transition-all duration-500 shadow-[0_0_10px_rgba(37,99,235,0.4)]"
                                                    style={{ width: `${(campaignProgress.current / campaignProgress.total) * 100}%` }}
                                                ></div>
                                            </div>
                                            <div className="flex gap-4 text-[10px] font-bold uppercase text-slate-500">
                                                <span className="text-green-500">✅ {campaignProgress.sent} Sent</span>
                                                <span className="text-red-500">🚫 {campaignProgress.invalid} Invalid</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* SCHEDULING - Plan Restricted */}
                                    <div className={`p-4 rounded-xl border space-y-3 transition-all ${userPlan.name === 'Gold' || userPlan.name === 'Enterprise' ? 'bg-slate-950 border-slate-800' : 'bg-slate-900/50 border-orange-500/20 opacity-80'}`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">
                                                <Clock size={14}/> Schedule Campaign (Optional)
                                            </div>
                                            {(userPlan.name !== 'Gold' && userPlan.name !== 'Enterprise') && (
                                                <span className="text-[9px] font-black uppercase text-orange-500 flex items-center gap-1">
                                                    <Crown size={10}/> Gold Only
                                                </span>
                                            )}
                                        </div>
                                        <input 
                                            type="datetime-local" 
                                            disabled={userPlan.name !== 'Gold' && userPlan.name !== 'Enterprise'}
                                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-white outline-none focus:border-blue-500 transition-all disabled:cursor-not-allowed"
                                            value={scheduledTime}
                                            onChange={(e) => setScheduledTime(e.target.value)}
                                        />
                                        {scheduledTime && (
                                            <p className="text-[10px] text-blue-500 font-bold italic">
                                                * Campaign will start automatically at {new Date(scheduledTime).toLocaleString()}
                                            </p>
                                        )}
                                    </div>

                                    {/* INTERACTIVE POLL (OPTIONAL) */}
                                    <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">
                                            <ListChecks size={14}/> Add Interactive Poll (Boosts Engagement)
                                        </div>
                                        <input 
                                            type="text" 
                                            placeholder="Poll Question (e.g. Do you like our offers?)" 
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs outline-none focus:border-blue-500 transition-all"
                                            value={pollData.question}
                                            onChange={(e) => handlePollChange('question', e.target.value)}
                                        />
                                        {pollData.question && (
                                            <div className="grid grid-cols-2 gap-2">
                                                {pollData.options.map((opt, i) => (
                                                    <input 
                                                        key={i}
                                                        type="text" 
                                                        placeholder={`Option ${i+1}`} 
                                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-[10px] outline-none focus:border-blue-500 transition-all"
                                                        value={opt}
                                                        onChange={(e) => handlePollChange('options', e.target.value, i)}
                                                    />
                                                ))}
                                                {pollData.options.length < 5 && (
                                                    <button 
                                                        onClick={addPollOption}
                                                        className="col-span-2 text-[9px] font-bold text-blue-500 uppercase hover:text-blue-400 transition-colors py-1"
                                                    >
                                                        + Add Option
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col md:flex-row gap-3">
                                        {activeCampaignId ? (
                                            <div className="flex-1 flex gap-2">
                                                <button 
                                                    onClick={stopCampaign} 
                                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                                                >
                                                    <XCircle size={20} className="animate-pulse"/> Stop Campaign
                                                </button>
                                                <button 
                                                    onClick={async () => {
                                                        if(window.confirm("Force reset will clear all stuck states. Use this if 'Stop' doesn't work.")) {
                                                            await stopCampaign();
                                                            setLoading(false);
                                                            setActiveCampaignId(null);
                                                        }
                                                    }} 
                                                    className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-4 rounded-xl font-bold transition-all border border-slate-700"
                                                    title="Force Reset"
                                                >
                                                    <RefreshCcw size={16}/>
                                                </button>
                                            </div>
                                        ) : loading ? (
                                            <button disabled className="flex-1 bg-slate-800 text-slate-500 py-4 rounded-xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 cursor-not-allowed border border-slate-700">
                                                <div className="w-4 h-4 border-2 border-slate-600 border-t-white rounded-full animate-spin"></div> Processing...
                                            </button>
                                        ) : (
                                            <>
                                                <button 
                                                    onClick={() => triggerCampaign(0)} 
                                                    disabled={!isWhatsAppReady}
                                                    className={`flex-1 ${isWhatsAppReady ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20' : 'bg-slate-800 opacity-50 cursor-not-allowed'} text-white py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2`}
                                                >
                                                    <Send size={18}/> {scheduledTime ? 'Schedule Campaign' : 'Start Campaign'}
                                                </button>
                                                
                                                {campaignProgress.total > 0 && campaignProgress.current < campaignProgress.total && (
                                                    <button 
                                                        onClick={() => triggerCampaign(campaignProgress.current)} 
                                                        disabled={!isWhatsAppReady}
                                                        className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
                                                    >
                                                        <RefreshCcw size={16}/> Resume from #{campaignProgress.current + 1}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                     </div>
                                </div>
                            </div>

                            {/* CONTACTS LIST */}
                            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                                <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex items-center gap-4">
                                    <h3 className="font-bold flex items-center gap-2 min-w-fit"><Users size={18} className="text-blue-500"/> Contacts</h3>
                                    <div className="flex-1 flex items-center gap-4">
                                        <div className="relative flex-1 max-w-xs">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14}/>
                                            <input 
                                                type="text" 
                                                placeholder="Search contacts..." 
                                                className="w-full bg-slate-950 border border-slate-800 pl-9 pr-4 py-2 rounded-lg text-xs"
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                            />
                                        </div>
                                        {selectedIds.length > 0 && (
                                            <span className="text-[10px] font-black uppercase text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
                                                {selectedIds.length} Selected
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="max-h-[400px] overflow-y-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-950/50 sticky top-0 text-[10px] uppercase text-slate-500 font-bold tracking-widest border-b border-slate-800">
                                            <tr>
                                                <th className="p-4 w-10">
                                                    <input 
                                                        type="checkbox" 
                                                        className="accent-blue-500"
                                                        checked={selectedIds.length === filteredCustomers.length && filteredCustomers.length > 0}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedIds(filteredCustomers.map(c => c.id));
                                                            } else {
                                                                setSelectedIds([]);
                                                            }
                                                        }}
                                                    />
                                                </th>
                                                <th className="p-4">Customer Name</th>
                                                <th className="p-4">Phone Number</th>
                                                <th className="p-4">Status</th>
                                                <th className="p-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {filteredCustomers.length > 0 ? filteredCustomers.map((c, i) => (
                                                <tr key={i} className={`hover:bg-slate-800/30 transition-colors group ${selectedIds.includes(c.id) ? 'bg-blue-500/5' : ''}`}>
                                                    <td className="p-4">
                                                        <input 
                                                            type="checkbox" 
                                                            className="accent-blue-500"
                                                            checked={selectedIds.includes(c.id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedIds(prev => [...prev, c.id]);
                                                                } else {
                                                                    setSelectedIds(prev => prev.filter(id => id !== c.id));
                                                                }
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="p-4 font-medium">{c.name}</td>
                                                    <td className="p-4 text-slate-400">+{c.number}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${
                                                            c.status === 'Sent' ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'
                                                        }`}>
                                                            {c.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <button 
                                                            onClick={() => deleteCustomer(c.id)} 
                                                            className="p-2 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                                            title="Remove from list"
                                                        >
                                                            <Trash2 size={16}/>
                                                        </button>
                                                    </td>
                                                </tr>
                                            )) : (
                                                <tr>
                                                    <td colSpan="5" className="p-8 text-center text-slate-500 text-sm">No contacts found. Upload an Excel file to start.</td>
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
            ) : activeTab === 'bot' ? (
                /* AUTO-RESPONDER BOT TAB */
                <div className="space-y-6">
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2"><Zap size={18} className="text-blue-500"/> Keyword Auto-Responder</h3>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">Trigger Keyword</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Price, Offer, Hello" 
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm outline-none focus:border-blue-500 transition-all"
                                    value={newAutoResponse.keyword}
                                    onChange={(e) => setNewAutoResponse({...newAutoResponse, keyword: e.target.value})}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">Bot Reply</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Our price is Rs. 999" 
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm outline-none focus:border-blue-500 transition-all"
                                    value={newAutoResponse.response}
                                    onChange={(e) => setNewAutoResponse({...newAutoResponse, response: e.target.value})}
                                />
                            </div>
                            <div className="flex items-end">
                                <button 
                                    onClick={addAutoResponse}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest rounded-xl py-3 px-6 transition-all shadow-lg shadow-blue-500/20"
                                >
                                    Add Rule
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-800 bg-slate-800/30">
                            <h3 className="font-bold text-xs uppercase tracking-widest text-slate-500">Active Bot Rules</h3>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-950/50 sticky top-0 text-[10px] uppercase text-slate-500 font-bold tracking-widest border-b border-slate-800">
                                    <tr>
                                        <th className="p-4">Keyword</th>
                                        <th className="p-4">Auto Response</th>
                                        <th className="p-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {autoResponses.length > 0 ? autoResponses.map((r, i) => (
                                        <tr key={i} className="hover:bg-slate-800/30 transition-colors group">
                                            <td className="p-4 font-bold text-blue-500">{r.keyword}</td>
                                            <td className="p-4 text-slate-400">{r.response}</td>
                                            <td className="p-4 text-right">
                                                <button onClick={() => deleteAutoResponse(r.id)} className="p-2 text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={16}/></button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="3" className="p-8 text-center text-slate-500 text-sm italic">No auto-responses set. Add one above!</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'history' ? (
                /* HISTORY TAB */
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col items-center justify-center space-y-4">
                            <HistoryIcon size={48} className="text-blue-500"/>
                            <h2 className="text-xl font-bold">Total Campaigns Run</h2>
                            <p className="text-4xl font-black text-white">{campaignHistory.length}</p>
                        </div>
                        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col items-center justify-center space-y-4">
                            <TrendingUp size={48} className="text-green-500"/>
                            <h2 className="text-xl font-bold">Overall Delivery Rate</h2>
                            <p className="text-4xl font-black text-green-500">
                                {campaignHistory.length > 0 ? Math.round((campaignHistory.reduce((acc, curr) => acc + (curr.sent_count || 0), 0) / campaignHistory.reduce((acc, curr) => acc + (curr.total_contacts || 1), 0)) * 100) : 0}%
                            </p>
                        </div>
                    </div>

                    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2"><ListChecks size={18} className="text-blue-500"/> Campaign History</h3>
                            <button onClick={fetchCampaignHistory} className="p-2 hover:bg-slate-800 rounded-lg transition-all text-slate-400"><RefreshCcw size={16}/></button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-950/50 text-[10px] uppercase text-slate-500 font-bold tracking-widest border-b border-slate-800">
                                    <tr>
                                        <th className="p-4">Date & Time</th>
                                        <th className="p-4">Campaign Name</th>
                                        <th className="p-4">Total</th>
                                        <th className="p-4">Sent</th>
                                        <th className="p-4">Invalid</th>
                                        <th className="p-4 text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {campaignHistory.length > 0 ? campaignHistory.map((c, i) => (
                                        <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="p-4 text-xs font-mono text-slate-400">{new Date(c.created_at).toLocaleString()}</td>
                                            <td className="p-4 font-bold text-slate-200">{c.name}</td>
                                            <td className="p-4 text-slate-400">{c.total_contacts}</td>
                                            <td className="p-4 text-green-500 font-bold">{c.sent_count || 0}</td>
                                            <td className="p-4 text-red-500">{c.invalid_count || 0}</td>
                                            <td className="p-4 text-right">
                                                <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${
                                                    c.status === 'Completed' ? 'bg-green-500/10 text-green-500' : 
                                                    c.status === 'Scheduled' ? 'bg-blue-500/10 text-blue-500' : 
                                                    'bg-orange-500/10 text-orange-500'
                                                }`}>
                                                    {c.status}
                                                </span>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="6" className="p-12 text-center text-slate-600 italic">No campaign history found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'billing' ? (
                /* PRICING & BILLING TAB */
                <div className="space-y-8 max-w-5xl mx-auto py-4">
                    <div className="text-center space-y-2">
                        <div className="inline-block px-4 py-1 bg-blue-600/20 text-blue-500 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 border border-blue-500/20">🔥 Introductory Offer - Limited Time</div>
                        <h2 className="text-3xl font-black italic uppercase tracking-tighter">Grow Your Business Faster</h2>
                        <p className="text-slate-500 text-sm">Affordable plans for every business size. Start today and scale later.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* MONTHLY STARTER PLAN */}
                        <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6 space-y-6 relative overflow-hidden flex flex-col">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-blue-400">
                                    <ShieldCheck size={20}/>
                                    <span className="font-black uppercase tracking-widest text-[10px]">Monthly</span>
                                </div>
                                <h3 className="text-3xl font-black">₹99<span className="text-sm text-slate-500 font-normal">/mo</span></h3>
                                <p className="text-slate-400 text-[10px]">Perfect to try out all basic features.</p>
                            </div>
                            <ul className="space-y-3 flex-1">
                                <li className="flex items-center gap-3 text-xs text-slate-300">
                                    <CheckCircle2 size={14} className="text-green-500"/> 200 Messages / day
                                </li>
                                <li className="flex items-center gap-3 text-xs text-slate-300">
                                    <XCircle size={14} className="text-red-500"/> No Photo/Media
                                </li>
                                <li className="flex items-center gap-3 text-xs text-slate-300">
                                    <XCircle size={14} className="text-red-500"/> No Bot/Scheduling
                                </li>
                            </ul>
                            <button 
                                onClick={() => handlePurchase('Monthly', 99, 200)}
                                disabled={loading || userPlan.name === 'Monthly'}
                                className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl uppercase tracking-widest text-xs transition-all"
                            >
                                {userPlan.name === 'Monthly' ? 'Current' : 'Buy 1 Month'}
                            </button>
                        </div>

                        {/* SILVER PLAN */}
                        <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6 space-y-6 relative overflow-hidden flex flex-col">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-blue-500">
                                    <Star size={20} fill="currentColor"/>
                                    <span className="font-black uppercase tracking-widest text-[10px]">Silver (Yearly)</span>
                                </div>
                                <h3 className="text-3xl font-black">₹599<span className="text-sm text-slate-500 font-normal">/yr</span></h3>
                                <p className="text-slate-400 text-[10px]">Best for local shops and small businesses.</p>
                            </div>
                            <ul className="space-y-3 flex-1">
                                <li className="flex items-center gap-3 text-xs text-slate-300">
                                    <CheckCircle2 size={14} className="text-green-500"/> 500 Messages / day
                                </li>
                                <li className="flex items-center gap-3 text-xs text-slate-300">
                                    <CheckCircle2 size={14} className="text-green-500"/> Photo/Media Support
                                </li>
                                <li className="flex items-center gap-3 text-xs text-slate-300">
                                    <XCircle size={14} className="text-red-500"/> No Bot/Scheduling
                                </li>
                            </ul>
                            <button 
                                onClick={() => handlePurchase('Silver', 599, 500)}
                                disabled={loading || userPlan.name === 'Silver'}
                                className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl uppercase tracking-widest text-xs transition-all"
                            >
                                {userPlan.name === 'Silver' ? 'Current' : 'Buy Yearly'}
                            </button>
                        </div>

                        {/* GOLD PLAN */}
                        <div className="bg-slate-900 rounded-3xl border-2 border-blue-600 p-6 space-y-6 relative overflow-hidden flex flex-col shadow-2xl shadow-blue-500/10 lg:scale-105 z-10">
                            <div className="absolute top-0 right-0 bg-blue-600 text-white text-[9px] font-black uppercase px-3 py-1 rounded-bl-lg">Best Value</div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-blue-500">
                                    <Crown size={20} fill="currentColor"/>
                                    <span className="font-black uppercase tracking-widest text-[10px]">Gold (Yearly)</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-3xl font-black">₹1199<span className="text-sm text-slate-500 font-normal">/yr</span></h3>
                                </div>
                                <p className="text-slate-400 text-[10px]">Everything Unlocked.</p>
                            </div>
                            <ul className="space-y-3 flex-1">
                                <li className="flex items-center gap-3 text-xs text-slate-300">
                                    <CheckCircle2 size={14} className="text-green-500"/> Unlimited Messages
                                </li>
                                <li className="flex items-center gap-3 text-xs text-slate-300">
                                    <CheckCircle2 size={14} className="text-green-500"/> Bot + Scheduling + Media
                                </li>
                            </ul>
                            <button 
                                onClick={() => handlePurchase('Gold', 1199, 1000000)}
                                disabled={loading || userPlan.name === 'Gold'}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl uppercase tracking-widest text-xs transition-all shadow-lg shadow-blue-500/20"
                            >
                                {userPlan.name === 'Gold' ? 'Current' : 'Upgrade to Gold'}
                            </button>
                        </div>

                        {/* ENTERPRISE PLAN */}
                        <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6 space-y-6 relative overflow-hidden flex flex-col">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-slate-500">
                                    <Zap size={20} fill="currentColor"/>
                                    <span className="font-black uppercase tracking-widest text-[10px]">Enterprise</span>
                                </div>
                                <h3 className="text-2xl font-black uppercase italic tracking-tighter">Contact Us</h3>
                                <p className="text-slate-400 text-[10px]">Tailored solutions.</p>
                            </div>
                            <ul className="space-y-3 flex-1">
                                <li className="flex items-center gap-3 text-xs text-slate-300">
                                    <CheckCircle2 size={14} className="text-green-500"/> Multi-Device Support
                                </li>
                                <li className="flex items-center gap-3 text-xs text-slate-300">
                                    <CheckCircle2 size={14} className="text-green-500"/> Dedicated Manager
                                </li>
                            </ul>
                            <button className="w-full bg-slate-800 hover:bg-slate-700 text-white font-black py-3 rounded-xl uppercase tracking-widest text-xs transition-all">Get in Touch</button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-500">
                    <AlertCircle size={48} className="mx-auto mb-4 opacity-20"/>
                    <p>Select a tab from the sidebar to continue.</p>
                </div>
            )}
        </main>

        {/* ADD CONTACT MODAL */}
        {showAddContactModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/30">
                        <h3 className="font-black uppercase tracking-widest text-sm flex items-center gap-2">
                            <Users size={18} className="text-blue-500"/> Add New Contact
                        </h3>
                        <button onClick={() => setShowAddContactModal(false)} className="text-slate-500 hover:text-white"><X size={20}/></button>
                    </div>
                    <form onSubmit={handleAddSingleContact} className="p-8 space-y-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Customer Name</label>
                                <input 
                                    type="text" 
                                    value={newContact.name}
                                    onChange={(e) => setNewContact({...newContact, name: e.target.value})}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white font-bold text-sm focus:outline-none focus:border-blue-600 transition-all"
                                    placeholder="e.g. Rahul Kumar"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">WhatsApp Number (10 Digits)</label>
                                <input 
                                    type="tel" 
                                    value={newContact.number}
                                    onChange={(e) => setNewContact({...newContact, number: e.target.value})}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white font-bold text-sm focus:outline-none focus:border-blue-600 transition-all"
                                    placeholder="e.g. 9876543210"
                                    required
                                    maxLength="10"
                                />
                            </div>
                        </div>
                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl shadow-lg transition-all active:scale-95 text-xs tracking-widest uppercase"
                        >
                            {loading ? "Adding..." : "Add to List"}
                        </button>
                    </form>
                </div>
            </div>
        )}

        {/* PAYMENT MODAL */}
        {showPaymentModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/30">
                        <h3 className="font-black uppercase tracking-widest text-sm flex items-center gap-2">
                            <CreditCard size={18} className="text-blue-500"/> Complete Payment
                        </h3>
                        <button onClick={() => setShowPaymentModal(null)} className="text-slate-500 hover:text-white"><X size={20}/></button>
                    </div>
                    <div className="p-8 space-y-6 text-center">
                        <div className="space-y-2">
                            <p className="text-slate-400 text-sm">You are upgrading to</p>
                            <h4 className="text-2xl font-black text-blue-500 uppercase">{showPaymentModal.plan} Plan</h4>
                            <p className="text-3xl font-black">₹{showPaymentModal.price}</p>
                        </div>

                        <div className="bg-white p-4 rounded-2xl inline-block mx-auto shadow-xl">
                            {/* QR CODE - Updated with user's UPI ID */}
                            <img 
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=abduls9125-5@okaxis%26pn=NM_MART%26am=${showPaymentModal.price}%26cu=INR`} 
                                alt="Payment QR Code" 
                                className="w-40 h-40"
                            />
                        </div>

                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase text-slate-500">Scan to Pay with Any UPI App</p>
                            <p className="text-xs text-slate-400 font-mono">UPI ID: abduls9125-5@okaxis</p>
                        </div>

                        <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl text-left">
                            <p className="text-[10px] text-blue-500 font-bold uppercase mb-1">Important Instruction:</p>
                            <p className="text-[11px] text-slate-400">After payment, click the button below. Our team will verify and activate your plan within 30 minutes.</p>
                        </div>

                        <button 
                            onClick={() => confirmPaymentRequest(showPaymentModal.plan, showPaymentModal.price, showPaymentModal.limit)}
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20"
                        >
                            {loading ? 'Processing...' : 'I have Paid'}
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
