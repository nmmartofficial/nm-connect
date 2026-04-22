import React, { useState, useEffect } from 'react';

export default function SessionManager({ userId, socket, backendUrl, onStatusChange }) {
  const [qrCode, setQrCode] = useState(null);
  const [status, setStatus] = useState('Checking Status...');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!socket || !userId) return;

    console.log("🛠️ SessionManager: Initializing socket listeners...");

    // Request session on mount
    socket.emit('request_session', userId);

    socket.on('whatsapp_status', (data) => {
      console.log("📡 Status Update:", data.msg);
      setStatus(data.msg);
    });

    socket.on('qr_update', (data) => {
      console.log("✅ SessionManager: QR Received");
      if (data.userId === userId) {
        setQrCode(data.qr);
        setStatus('Scan QR Now');
        setLoading(false);
      }
    });

    socket.on('whatsapp_authenticated', (data) => {
      console.log("🔓 SessionManager: Authenticated, waiting for ready...");
      if (data.userId === userId) {
        setQrCode(null);
        setLoading(true);
        setStatus('Connecting to WhatsApp...');
      }
    });

    socket.on('whatsapp_ready', (data) => {
      console.log("🚀 SessionManager: WhatsApp Ready");
      if (data.userId === userId) {
        setQrCode(null);
        setStatus('Connected ✅');
        setLoading(false);
        if (onStatusChange) onStatusChange(true);
      }
    });

    socket.on('whatsapp_disconnected', () => {
      console.log("🔌 SessionManager: WhatsApp Disconnected");
      setQrCode(null);
      setStatus('Disconnected ❌');
      setLoading(false);
      if (onStatusChange) onStatusChange(false);
    });

    socket.on('whatsapp_error', (data) => {
      console.error("❌ SessionManager: WhatsApp Error", data.message);
      setStatus(`Error: ${data.message}`);
      setLoading(false);
    });

    return () => {
      socket.off('whatsapp_status');
      socket.off('qr_update');
      socket.off('whatsapp_ready');
      socket.off('whatsapp_disconnected');
      socket.off('whatsapp_error');
    };
  }, [userId, socket, onStatusChange]);

  const handleManualReconnect = () => {
    setLoading(true);
    setQrCode(null);
    setStatus('Re-initializing...');
    socket.emit('request_session', userId);
  };

  const handleResetEngine = async () => {
    if (!window.confirm("Are you sure? This will logout WhatsApp and delete session data. You will need to scan QR again.")) return;
    
    setLoading(true);
    setStatus('Resetting Engine...');
    setQrCode(null);
    
    console.log(`🌐 Resetting engine at: ${backendUrl}/api/reset-session`);
    
    try {
      const response = await fetch(`${backendUrl}/api/reset-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      console.log(`📡 Response status: ${response.status}`);
      
      if (response.ok) {
        alert("Engine Reset Successful! Initializing fresh session...");
        socket.emit('request_session', userId);
      } else {
        const errorText = await response.text();
        console.error(`❌ Reset Error Response: ${errorText}`);
        alert(`Failed to reset engine. Status: ${response.status}`);
      }
    } catch (err) {
      console.error(`❌ Fetch Exception:`, err);
      alert(`Error connecting to server: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/50 text-center shadow-xl">
      <div className="flex justify-between items-center mb-3">
        <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">WhatsApp Status</p>
        <div className={`h-1.5 w-1.5 rounded-full ${status.includes('✅') ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.6)]' : 'bg-orange-500 animate-pulse'}`}></div>
      </div>

      <div className="flex flex-col items-center justify-center min-h-[100px]">
        {loading && !qrCode ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-[9px] text-slate-500 font-bold uppercase">{status}</p>
          </div>
        ) : qrCode ? (
          <div className="animate-in fade-in zoom-in duration-500">
            <div className="bg-white p-2 rounded-xl shadow-2xl">
              <img src={qrCode} alt="WhatsApp QR" className="w-[110px] h-[110px]" />
            </div>
            <button 
                onClick={handleResetEngine}
                className="mt-2 text-[8px] text-red-500/50 hover:text-red-500 font-bold uppercase transition-colors"
            >
                Reset QR
            </button>
          </div>
        ) : (
          <div className="w-full py-3 px-4 bg-slate-950/30 rounded-xl border border-slate-800/30">
            <p className={`text-[10px] font-black uppercase tracking-wider ${status.includes('✅') ? 'text-green-400' : 'text-slate-500'}`}>
              {status}
            </p>
            {!status.includes('✅') && (
              <div className="flex flex-col gap-1.5 mt-2">
                <button 
                  onClick={handleManualReconnect}
                  className="text-[9px] text-blue-500 hover:text-blue-400 font-bold uppercase underline"
                >
                  Reconnect
                </button>
                <button 
                  onClick={handleResetEngine}
                  className="text-[8px] text-slate-700 hover:text-red-500 font-bold uppercase"
                >
                  Reset Engine
                </button>
              </div>
            )}
            {status.includes('✅') && (
                <button 
                    onClick={handleResetEngine}
                    className="mt-2 text-[8px] text-slate-700 hover:text-red-500 font-bold uppercase"
                >
                    Logout / Switch
                </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
