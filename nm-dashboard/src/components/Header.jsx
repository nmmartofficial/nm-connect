import React from 'react';
import { Menu, Users, CheckCircle2, MessageSquare, Crown } from 'lucide-react';

const Header = ({ 
  isMobileMenuOpen, 
  setIsMobileMenuOpen, 
  whatsappProfilePic, 
  whatsappUserName, 
  userProfileName, 
  isWhatsAppReady, 
  userPlan 
}) => {
  return (
    <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md">
      <div className="md:hidden">
        <button onClick={() => setIsMobileMenuOpen(true)} className="text-white">
          <Menu size={24} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-10 w-10 bg-blue-500/10 rounded-full border border-blue-500/20 overflow-hidden flex items-center justify-center">
          {whatsappProfilePic ? (
            <img src={whatsappProfilePic} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <Users size={20} className="text-blue-500" />
          )}
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <span className="text-white font-semibold text-sm leading-tight truncate max-w-[120px] md:max-w-[200px]">
              {whatsappUserName || userProfileName || 'Partner'}
            </span>
            {isWhatsAppReady && <CheckCircle2 size={12} className="text-green-500" fill="currentColor" />}
          </div>
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">
            {isWhatsAppReady ? 'Connected Profile' : 'Verified User'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 ml-auto">
        {isWhatsAppReady && whatsappUserName && (
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20">
            <MessageSquare size={14} className="text-green-500" />
            <span className="text-[10px] font-black uppercase tracking-wider text-green-500">{whatsappUserName}</span>
          </div>
        )}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-blue-500/10 rounded-full border border-blue-500/20">
          <Crown size={14} className="text-blue-500" />
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-500">{userPlan.name} Plan</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full border border-slate-700">
          <div className={`h-2 w-2 rounded-full ${isWhatsAppReady ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
          <span className="text-[10px] font-bold uppercase tracking-wider">{isWhatsAppReady ? 'WhatsApp Connected' : 'Disconnected'}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
