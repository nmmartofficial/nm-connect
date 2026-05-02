import React, { useState, useEffect } from 'react';
import { Database, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient';

const InventorySection = ({ userId }) => {
  const [inventory, setInventory] = useState([]);
  const [newInv, setNewInv] = useState({ product_name: '', mrp: '', sale_price: '', discount: '' });

  useEffect(() => { if (userId) fetchInv(); }, [userId]);

  const fetchInv = async () => {
    const { data } = await supabase.from('inventory').select('*').eq('user_id', userId).order('id', { ascending: false });
    if (data) setInventory(data);
  };

  const addInv = async () => {
    if (!newInv.product_name || !newInv.sale_price) return alert("Fill required fields");
    const { error } = await supabase.from('inventory').insert([{ 
      item_name: newInv.product_name, mrp: newInv.mrp, 
      sale_price: newInv.sale_price, discount: newInv.discount, user_id: userId 
    }]);
    if (!error) { setNewInv({ product_name: '', mrp: '', sale_price: '', discount: '' }); fetchInv(); }
  };

  const deleteInv = async (id) => {
    if (window.confirm("Delete this product?")) {
      const { error } = await supabase.from('inventory').delete().eq('id', id);
      if (!error) fetchInv();
    }
  };

  return (
    <div className="space-y-4">
      {/* Input Form */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-800/40 p-4 rounded-xl border border-slate-700">
        <input type="text" placeholder="Product Name" className="bg-slate-900 border-slate-700 rounded-lg px-3 py-2 text-sm text-white" value={newInv.product_name} onChange={e => setNewInv({...newInv, product_name: e.target.value})} />
        <input type="number" placeholder="MRP" className="bg-slate-900 border-slate-700 rounded-lg px-3 py-2 text-sm text-white" value={newInv.mrp} onChange={e => setNewInv({...newInv, mrp: e.target.value})} />
        <input type="number" placeholder="Sale Price" className="bg-slate-900 border-slate-700 rounded-lg px-3 py-2 text-sm text-white" value={newInv.sale_price} onChange={e => setNewInv({...newInv, sale_price: e.target.value})} />
        <button onClick={addInv} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95"><Plus size={16} /> Add Product</button>
      </div>

      {/* Table Section with fixed height for scrolling */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-slate-300 border-collapse">
            <thead className="bg-slate-800 sticky top-0 z-10 shadow-md text-slate-400 uppercase text-xs">
              <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">MRP</th><th className="px-4 py-3">Sale</th><th className="px-4 py-3 text-center">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {inventory.length > 0 ? inventory.map(item => (
                <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">{item.item_name}</td>
                  <td className="px-4 py-3 text-slate-400">₹{item.mrp}</td>
                  <td className="px-4 py-3 text-green-400 font-bold">₹{item.sale_price}</td>
                  <td className="px-4 py-3 text-center"><button onClick={() => deleteInv(item.id)} className="text-red-500 hover:text-red-400 p-1 hover:bg-red-500/10 rounded-md"><Trash2 size={16} /></button></td>
                </tr>
              )) : (
                <tr><td colSpan="4" className="px-4 py-10 text-center text-slate-500 italic">No products found in inventory.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InventorySection;