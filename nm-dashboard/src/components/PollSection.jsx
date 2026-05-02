import React from 'react';
import { ListChecks, Plus } from 'lucide-react';

const PollSection = ({ pollData, setPollData }) => {
  const addOption = () => setPollData({ ...pollData, options: [...pollData.options, ''] });
  const updateOpt = (val, idx) => {
    const newOpts = [...pollData.options];
    newOpts[idx] = val;
    setPollData({ ...pollData, options: newOpts });
  };

  return (
    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-4">
      <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><ListChecks size={14} /> Interactive Poll</h4>
      <input type="text" placeholder="Poll Question" className="w-full bg-slate-800 border-slate-700 rounded-lg px-3 py-2 text-sm text-white" value={pollData.question} onChange={e => setPollData({...pollData, question: e.target.value})} />
      <div className="space-y-2">
        {pollData.options.map((opt, idx) => (
          <input key={idx} type="text" placeholder={`Option ${idx + 1}`} className="w-full bg-slate-900 border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300" value={opt} onChange={e => updateOpt(e.target.value, idx)} />
        ))}
        <button onClick={addOption} className="text-blue-500 text-[10px] font-bold uppercase flex items-center gap-1 hover:text-blue-400"><Plus size={12} /> Add Option</button>
      </div>
    </div>
  );
};

export default PollSection;
