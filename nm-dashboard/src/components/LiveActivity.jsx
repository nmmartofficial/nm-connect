import React from 'react';
import { Zap, ListChecks } from 'lucide-react';

const maskPhoneNumber = (text) => {
  if (!text) return text;
  return text.replace(/(\+?\d{1,3})?(\d{6,})(\d{4})/g, (match, countryCode, middle, last4) => {
    const masked = '*'.repeat(middle.length);
    return (countryCode || '') + masked + last4;
  });
};

const LiveActivity = ({ campaignProgress, logs = [] }) => {
  // Safety fallback for progress object
  const progress = campaignProgress || { current: 0, total: 0, nextAction: 'Waiting...' };
  
  // Prevent Division by Zero if total is 0
  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Progress Card */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
        <h3 className="font-bold flex items-center gap-2 text-blue-500">
          <Zap size={18} fill="currentColor" /> Live Activity
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
            <span>Progress</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 italic">Next: {progress.nextAction || 'Initializing...'}</p>
        </div>
      </div>

      {/* Terminal Logs */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 flex flex-col h-[400px]">
        <div className="p-4 border-b border-slate-800 flex items-center gap-2 font-bold text-slate-300">
          <ListChecks size={18} className="text-blue-500" /> Terminal Logs
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[10px] custom-scrollbar">
          {!logs || logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2">
              <Zap size={24} className="opacity-10 animate-pulse" />
              <p>Waiting for activity...</p>
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={`flex gap-2 ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-slate-400'}`}>
                <span className="opacity-30">[{log.time || '00:00'}]</span>
                <span className="break-all">{maskPhoneNumber(log.msg)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveActivity;