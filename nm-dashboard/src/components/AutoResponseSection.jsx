import React, { useState, useEffect } from 'react';
import { Bot, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient';

const AutoResponseSection = ({ userId }) => {
  const [responses, setResponses] = useState([]);
  const [newRes, setNewRes] = useState({ keyword: '', response: '' });

  useEffect(() => { if (userId) fetchRes(); }, [userId]);

  const fetchRes = async () => {
    const { data } = await supabase.from('auto_responses').select('*').eq('user_id', userId);
    if (data) setResponses(data);
  };

  const addRes = async () => {
    if (!newRes.keyword || !newRes.response) return alert("Fill all fields");
    const { error } = await supabase.from('auto_responses').insert([{ ...newRes, user_id: userId }]);
    if (!error) { setNewRes({ keyword: '', response: '' }); fetchRes(); }
  };

  const deleteRes = async (id) => {
    const { error } = await supabase.from('auto_responses').delete().eq('id', id);
    if (!error) fetchRes();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
        <input type="text" placeholder="Keyword (e.g. 'Price')" className="bg-slate-900 border-slate-700 rounded-lg px-3 py-2 text-sm" value={newRes.keyword} onChange={e => setNewRes({...newRes, keyword: e.target.value})} />
        <input type="text" placeholder="Response Message" className="bg-slate-900 border-slate-700 rounded-lg px-3 py-2 text-sm" value={newRes.response} onChange={e => setNewRes({...newRes, response: e.target.value})} />
        <button onClick={addRes} className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 text-sm font-bold flex items-center justify-center gap-2"><Plus size={16} /> Add Rule</button>
      </div>
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800/50 text-slate-400 uppercase text-xs">
            <tr><th className="px-4 py-3">Keyword</th><th className="px-4 py-3">Response</th><th className="px-4 py-3">Action</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {responses.map(res => (
              <tr key={res.id} className="hover:bg-slate-800/30">
                <td className="px-4 py-3 font-bold text-blue-400">{res.keyword}</td>
                <td className="px-4 py-3 truncate max-w-xs">{res.response}</td>
                <td className="px-4 py-3"><button onClick={() => deleteRes(res.id)} className="text-red-500 hover:text-red-400"><Trash2 size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AutoResponseSection;
