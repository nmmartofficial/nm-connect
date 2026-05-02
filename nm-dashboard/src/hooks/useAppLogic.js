import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

/**
 * Custom hook to manage global application state and data fetching
 * @param {string} USER_ID - The unique ID of the authenticated user
 */
export const useAppLogic = (USER_ID) => {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'dashboard');
  const [customers, setCustomers] = useState([]);
  const [isWhatsAppReady, setIsWhatsAppReady] = useState(false);
  const [whatsappUserName, setWhatsappUserName] = useState('');
  const [whatsappProfilePic, setWhatsappProfilePic] = useState(null);
  const [userProfileName, setUserProfileName] = useState('');
  const [userPlan, setUserPlan] = useState({ name: 'Pro', isExpired: false, limit: 5000 });
  const [logs, setLogs] = useState([]);

  // Sync active tab to local storage for persistence
  useEffect(() => { 
    localStorage.setItem('activeTab', activeTab); 
  }, [activeTab]);

  /**
   * Fetches the customer list from Supabase for the current user
   */
  const fetchCustomers = async () => {
    if (!USER_ID) return;
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', USER_ID)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      if (data) setCustomers(data);
    } catch (err) {
      console.error("Fetch Customers Error:", err.message);
    }
  };

  /**
   * Imports new contacts from Excel and syncs with Supabase
   * @param {Array} newContacts - List of contacts to import
   */
  const importContacts = async (newContacts) => {
    if (!USER_ID || !newContacts.length) return;
    try {
      const formatted = newContacts.map(c => ({ 
        ...c, 
        user_id: USER_ID, 
        status: 'Pending'
      }));
      
      const { error } = await supabase
        .from('customers')
        .upsert(formatted, { onConflict: 'number,user_id' });
        
      if (error) throw error;
      await fetchCustomers(); // Refresh list after import
    } catch (err) {
      console.error("Import Error:", err.message);
      alert("Import failed: " + err.message);
    }
  };

  // Initial fetch on mount or user change
  useEffect(() => { 
    if (USER_ID) fetchCustomers(); 
  }, [USER_ID]);

  return {
    activeTab, setActiveTab, customers, setCustomers,
    isWhatsAppReady, setIsWhatsAppReady, whatsappUserName, setWhatsappUserName,
    whatsappProfilePic, setWhatsappProfilePic, userProfileName, setUserProfileName,
    userPlan, setUserPlan, logs, setLogs, fetchCustomers, importContacts
  };
};
