import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-amber-900 text-xs font-bold flex items-center justify-center gap-2"
    >
      <WifiOff size={14} className="text-amber-600 shrink-0" />
      <span>Mode Offline Aktif — Data tersimpan lokal di perangkat Anda.</span>
    </div>
  );
};
