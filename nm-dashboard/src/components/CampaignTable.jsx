import React from 'react';
import { Search, Filter, Trash2, CheckCircle2, Clock } from 'lucide-react';

const CampaignTable = ({ 
  searchTerm = '', 
  setSearchTerm, 
  customers = [], // Default empty array to prevent crash
  selectedIds = [], 
  setSelectedIds, 
  deleteCustomer 
}) => {
  // Safety check to ensure customers is always an array
  const safeCustomers = Array.isArray(customers) ? customers : [];

  const filtered = safeCustomers.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.number?.includes(searchTerm)
  );

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input 
            type="text" 
            placeholder="Search numbers or names..." 
            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-xs outline-none focus:border-blue-500 transition-all text-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="p-2 bg-slate-800 text-slate-400 rounded-xl hover:bg-slate-700 transition-colors">
          <Filter size={18} />
        </button>
      </div>

      <div className="overflow-x-auto custom-scrollbar max-h-[500px] overflow-y-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-950/50 text-slate-500 font-black uppercase tracking-widest border-b border-slate-800 sticky top-0 z-10">
            <tr>
              <th className="p-4 w-10">
                <input 
                  type="checkbox" 
                  onChange={(e) => setSelectedIds(e.target.checked ? filtered.map(c => c.id) : [])} 
                  checked={filtered.length > 0 && selectedIds.length === filtered.length} 
                />
              </th>
              <th className="p-4">Contact</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filtered.length > 0 ? filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-800/30 transition-colors group">
                <td className="p-4">
                  <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleSelect(c.id)} />
                </td>
                <td className="p-4">
                  <p className="font-bold text-slate-200">{c.name || 'Unknown'}</p>
                  <p className="text-[10px] text-slate-500 font-mono">{c.number}</p>
                </td>
                <td className="p-4">
                  {c.status === 'Sent' ? (
                    <span className="flex items-center gap-1 text-green-500 font-bold"><CheckCircle2 size={12} /> Sent</span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-500"><Clock size={12} /> Pending</span>
                  )}
                </td>
                <td className="p-4 text-right">
                  <button 
                    onClick={() => deleteCustomer(c.id)} 
                    className="p-2 text-slate-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="4" className="p-10 text-center text-slate-500 italic">No contacts found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CampaignTable;