import React from 'react';
import { 
  X, LayoutDashboard, History as HistoryIcon, Bot, Crown, CreditCard, Settings, LogOut 
} from 'lucide-react';
import SessionManager from '../SessionManager';
import { supabase } from '../supabaseClient';

const Sidebar = ({ 
  isMobileMenuOpen, setIsMobileMenuOpen, activeTab, setActiveTab, userPlan, 
  USER_ID, socket, BACKEND_URL, setIsWhatsAppReady 
}) => {
  return (
    <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 p-6 flex flex-col transition-transform md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative`}>
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="NM Logo" className="w-8 h-8 rounded-lg shadow-lg border border-slate-700" />
          <h1 className="text-xl font-black italic uppercase tracking-tighter text-white">NM CONNECT</h1>
        </div>
        <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-slate-400"><X size={24} /></button>
      </div>

      <nav className="space-y-1 flex-1 overflow-y-auto pr-2">
        <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={18} />} label="Campaign" />
        <NavItem active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<HistoryIcon size={18} />} label="History" />
        <NavItem active={activeTab === 'billing'} onClick={() => setActiveTab('billing')} icon={<CreditCard size={18} />} label="Pricing" />
        <NavItem active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={18} />} label="Profile" />
      </nav>

      <div className="mt-4 pt-4 border-t border-slate-800">
        <SessionManager userId={USER_ID} socket={socket} backendUrl={BACKEND_URL} onStatusChange={setIsWhatsAppReady} />
        <button onClick={() => supabase.auth.signOut()} className="w-full flex items-center gap-3 p-2 text-slate-500 hover:text-red-400 rounded-xl font-bold transition-colors mt-2 text-xs uppercase tracking-widest"><LogOut size={16} /> Logout</button>
      </div>
    </div>
  );
};

const NavItem = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 p-2.5 rounded-xl font-bold transition-all ${active ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
    {icon} {label}
  </button>
);

export default Sidebar;
