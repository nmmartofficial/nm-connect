import React, { useState, useEffect } from 'react';
import { Settings, Save, LogOut } from 'lucide-react';
import { supabase } from '../supabaseClient';

const SettingsSection = ({ userId, session }) => {
  const [bizName, setBizName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userId) supabase.from('users').select('business_name').eq('id', userId).single()
      .then(({ data }) => setBizName(data?.business_name || ''));
  }, [userId]);

  const updateBiz = async () => {
    setLoading(true);
    const { error } = await supabase.from('users').update({ business_name: bizName }).eq('id', userId);
    setLoading(false);
    if (!error) alert("Settings saved!");
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2"><Settings size={20} className="text-blue-500" /> Store Profile</h3>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Business Name</label>
          <input type="text" value={bizName} onChange={e => setBizName(e.target.value)} className="w-full bg-slate-800 border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
        </div>
        <button onClick={updateBiz} disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all"><Save size={18} /> {loading ? 'Saving...' : 'Save Changes'}</button>
      </div>
      <div className="bg-red-500/5 p-6 rounded-2xl border border-red-500/20 space-y-4">
        <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">Danger Zone</h3>
        <button onClick={() => supabase.auth.signOut()} className="bg-red-500 hover:bg-red-600 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all"><LogOut size={18} /> Logout Account</button>
      </div>
    </div>
  );
};

export default SettingsSection;
