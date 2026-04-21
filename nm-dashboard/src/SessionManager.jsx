import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function SessionManager({ userId, socket, onStatusChange }) {
  const [qrCode, setQrCode] = useState(null);
  const [wsStatus, setWsStatus] = useState('Checking...');
  const [loading, setLoading] = useState(true);
  const retryTimer = useRef(null);

  useEffect(() => {
    if (!userId || !socket) return;

    const initSession = () => {
      if (wsStatus === 'Connected ✅') return; // Agar connected hai toh dubara request na karein
      console.log(`🚀 Requesting session for: ${userId}`);
      setLoading(true);
      socket.emit('init-session', userId);
    };

    socket.on('connect', () => {
      console.log("Connected to Backend Socket ✅");
      initSession();
    });

    // QR Code milne par
    socket.on(`qr_${userId}`, (qr) => {
      console.log("✅ QR Code Received from Backend");
      if (retryTimer.current) clearTimeout(retryTimer.current);
      setQrCode(qr);
      setWsStatus('Scan QR Now');
      setLoading(false);
      if (onStatusChange) onStatusChange(false);
    });

    // WhatsApp Ready hone par
    socket.on(`ready_${userId}`, () => {
      console.log("🚀 WhatsApp is Ready!");
      setQrCode(null);
      setWsStatus('Connected ✅');
      setLoading(false);
      if (onStatusChange) onStatusChange(true);
    });

    // Disconnected hone par automatic retry
    socket.on(`disconnected_${userId}`, () => {
      setWsStatus('Disconnected...');
      setQrCode(null);
      setLoading(true);
      if (onStatusChange) onStatusChange(false);
      
      // Purana timer saaf karein aur 5 sec baad phir try karein
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(initSession, 5000); 
    });

    // Agar component load hote hi socket connect ho chuka hai
    if (socket.connected) initSession();

    return () => {
      socket.off(`qr_${userId}`);
      socket.off(`ready_${userId}`);
      socket.off(`disconnected_${userId}`);
      socket.off('connect');
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [userId, socket, onStatusChange, wsStatus]);

  return (
    <div className="bg-slate-900/90 p-5 rounded-[2rem] border border-slate-800 mb-6 text-center group relative overflow-hidden shadow-2xl">
      
      <div className="flex justify-between items-center mb-4">
        <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">
          NM-SESSION: {userId?.substring(0, 8)}
        </p>
        <div className={`h-1.5 w-1.5 rounded-full ${wsStatus.includes('✅') ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-orange-500 animate-pulse'}`}></div>
      </div>
      
      {loading && !qrCode && (
        <div className="py-6 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Initialising Server...</p>
        </div>
      )}

      {qrCode ? (
        <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
          <div className="bg-white p-3 rounded-2xl inline-block shadow-2xl border-4 border-slate-950">
            {qrCode.startsWith('data:image') ? (
              <img src={qrCode} alt="WhatsApp QR" className="w-[150px] h-[150px]" />
            ) : (
              <QRCodeSVG 
                value={qrCode} 
                size={150} 
                level="H"
                includeMargin={false} 
              />
            )}
          </div>
          <div className="mt-4 bg-blue-500/10 px-4 py-2 rounded-xl border border-blue-500/20">
             <p className="text-[10px] font-black text-blue-400 uppercase tracking-tighter">
                Open WhatsApp &gt; Linked Devices
             </p>
          </div>
        </div>
      ) : (
        !loading && (
          <div className="py-4 bg-slate-950/50 rounded-2xl border border-slate-800/50">
            <p className={`text-xs font-black uppercase tracking-widest mb-1 
              ${wsStatus.includes('✅') ? 'text-green-400' : 'text-slate-400'}`}>
              {wsStatus}
            </p>
            {wsStatus.includes('✅') && (
              <p className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">System Operational</p>
            )}
          </div>
        )
      )}
    </div>
  );
}