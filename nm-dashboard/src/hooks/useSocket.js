import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export const useSocket = (BACKEND_URL, USER_ID, handlers) => {
  const socketRef = useRef(null);
  const hasRequested = useRef(false);

  useEffect(() => {
    if (!USER_ID) return;

    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log("🟢 Socket Connected");
      if (!hasRequested.current) {
        socket.emit('request_session', USER_ID);
        hasRequested.current = true;
      }
      handlers.onConnect?.();
    });

    socket.on('whatsapp_status', (data) => {
      if (data.userId === USER_ID) handlers.onStatus?.(data);
    });

    socket.on(`log_${USER_ID}`, (newLog) => handlers.onLog?.(newLog));
    socket.on(`ready_${USER_ID}`, (data) => handlers.onReady?.(data));
    socket.on(`disconnected_${USER_ID}`, () => handlers.onDisconnect?.());

    return () => {
      socket.disconnect();
      hasRequested.current = false;
    };
  }, [BACKEND_URL, USER_ID]);

  return socketRef.current;
};
