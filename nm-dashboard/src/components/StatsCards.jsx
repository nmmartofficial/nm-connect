import React from 'react';
import { Users, CheckCircle2, Clock, XCircle } from 'lucide-react';

const StatsCards = ({ stats, campaignProgress }) => {
  const cards = [
    { label: 'Total', value: stats.total, icon: <Users size={24} />, color: 'blue' },
    { label: 'Sent', value: stats.sent, icon: <CheckCircle2 size={24} />, color: 'green' },
    { label: 'Pending', value: stats.pending, icon: <Clock size={24} />, color: 'orange' },
    { label: 'Invalid Removed', value: campaignProgress?.invalid || 0, icon: <XCircle size={24} />, color: 'red' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
          <div className={`p-3 bg-${card.color}-500/10 rounded-xl text-${card.color}-500`}>
            {card.icon}
          </div>
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase">{card.label}</p>
            <p className={`text-2xl font-black ${card.color === 'green' ? 'text-green-500' : card.color === 'orange' ? 'text-orange-500' : card.color === 'red' ? 'text-red-500' : ''}`}>
              {card.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsCards;
