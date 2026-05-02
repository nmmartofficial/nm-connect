import React from 'react';
import { Clock } from 'lucide-react';

const ScheduleSection = ({ scheduledTime, setScheduledTime }) => {
  return (
    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-4">
      <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Clock size={14} /> Schedule Campaign</h4>
      <div className="space-y-2">
        <label className="text-[10px] text-slate-500 font-medium">Select Date & Time</label>
        <input 
          type="datetime-local" 
          className="w-full bg-slate-800 border-slate-700 rounded-lg px-3 py-2 text-sm text-white color-scheme-dark" 
          value={scheduledTime} 
          onChange={e => setScheduledTime(e.target.value)} 
        />
        <p className="text-[10px] text-blue-500/70 italic">* Campaign will start automatically at the set time.</p>
      </div>
    </div>
  );
};

export default ScheduleSection;
