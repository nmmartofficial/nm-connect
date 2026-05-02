import React from 'react';
import { Crown, CheckCircle2, Zap } from 'lucide-react';

const BillingSection = ({ userPlan }) => {
  const plans = [
    { name: 'Free', price: '₹0', features: ['200 Messages/Day', 'Basic Support', 'Standard Speed'], color: 'slate' },
    { name: 'Silver', price: '₹499', features: ['2000 Messages/Day', 'Priority Support', 'Turbo Speed'], color: 'blue' },
    { name: 'Gold', price: '₹999', features: ['Unlimited Messages', '24/7 Support', 'Fastest Speed'], color: 'yellow' }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {plans.map(plan => (
        <div key={plan.name} className={`p-6 rounded-2xl border ${userPlan.name === plan.name ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 bg-slate-900/50'} flex flex-col`}>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xl font-bold text-white">{plan.name}</h3>
            {userPlan.name === plan.name && <span className="px-2 py-1 bg-blue-500 text-[10px] font-bold rounded uppercase">Current</span>}
          </div>
          <div className="text-3xl font-black text-white mb-6">{plan.price}<span className="text-sm text-slate-500 font-normal">/month</span></div>
          <ul className="space-y-3 mb-8 flex-grow">
            {plan.features.map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-slate-400">
                <CheckCircle2 size={16} className="text-blue-500" /> {f}
              </li>
            ))}
          </ul>
          <button className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${userPlan.name === plan.name ? 'bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20'}`}>
            {userPlan.name === plan.name ? 'Active' : 'Upgrade Now'}
          </button>
        </div>
      ))}
    </div>
  );
};

export default BillingSection;
