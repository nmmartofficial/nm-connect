import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Zap, ShieldCheck, ShoppingCart, TrendingUp, MessageSquare, Coins } from 'lucide-react';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else onLoginSuccess(data.user);
    setLoading(false);
  };

  return (
    <div className="h-screen w-full bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* CINEMATIC NEON BACKGROUND ELEMENTS */}
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-blue-600/20 blur-[80px] rounded-full animate-pulse"></div>
      <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-cyan-500/10 blur-[80px] rounded-full"></div>
      
      {/* MAIN LOGIN GLASS CARD (Optimized for No-Scroll) */}
      <div className="relative z-10 w-full max-w-[1000px] h-full max-h-[600px] md:h-auto flex flex-col md:flex-row bg-slate-900/40 backdrop-blur-2xl rounded-[2rem] md:rounded-[3rem] border border-slate-800 shadow-2xl overflow-hidden">
        
        {/* LEFT SIDE: BRANDING (Hidden/Compact on small mobile) */}
        <div className="hidden md:flex flex-1 p-12 flex-col justify-center bg-gradient-to-br from-blue-600/10 to-transparent">
          <div className="flex items-center gap-4 mb-6">
             <div className="bg-blue-600 p-2 rounded-xl">
                <Zap size={24} className="text-white" fill="currentColor" />
             </div>
             <h1 className="text-2xl font-black text-white italic tracking-tighter uppercase">NM CONNECT</h1>
          </div>
          <h2 className="text-4xl font-black text-white leading-tight mb-4">The Future of <br /> Retail.</h2>
          <p className="text-slate-400 text-sm font-medium">SaaS v5.0 | Multi-Device | Anti-Ban</p>
        </div>

        {/* RIGHT SIDE: LOGIN FORM (One Screen Mobile View) */}
        <div className="w-full md:w-[400px] p-8 md:p-12 bg-slate-950/50 flex flex-col justify-center">
          <div className="md:hidden flex items-center justify-center gap-3 mb-8">
             <Zap size={24} className="text-blue-500" fill="currentColor" />
             <h1 className="text-xl font-black text-white italic tracking-tighter uppercase">NM CONNECT</h1>
          </div>

          <div className="mb-8 text-center md:text-left">
             <h3 className="text-xl font-black text-white mb-1">Welcome Back</h3>
             <p className="text-slate-500 font-medium uppercase text-[10px] tracking-widest">Admin Access Only</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Email</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-white font-bold text-sm focus:outline-none focus:border-blue-600 transition-all"
                placeholder="admin@nm-connect.com"
                required
              />
            </div>
            
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-white font-bold text-sm focus:outline-none focus:border-blue-600 transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="text-red-400 text-[10px] font-bold text-center">
                 ⚠️ {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black uppercase py-4 rounded-xl shadow-lg transition-all active:scale-95 text-xs tracking-widest"
            >
              {loading ? "..." : "Launch Dashboard"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
