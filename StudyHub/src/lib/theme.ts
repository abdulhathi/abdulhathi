import { useEffect, useState } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'study-hub.theme';

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readMode);
  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* the choice lasts for this visit only */
    }
  }, [mode]);
  const next = () => setMode((m) => (m === 'system' ? 'light' : m === 'light' ? 'dark' : 'system'));
  return { mode, next };
}
