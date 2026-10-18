import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { STACKS, type Stack } from './snippets';
import { readJson, writeJson } from './storage';

const KEY = 'auth-lab.stack';
type StackState = { stack: Stack; setStack: (s: Stack) => void };
const StackContext = createContext<StackState>({ stack: 'node', setStack: () => {} });

/** The stack the learner reads code in. Choosing it in any tab group switches every example, and is remembered. */
export function StackProvider({ children }: { children: ReactNode }) {
  const [stack, set] = useState<Stack>(() => {
    const saved = readJson<unknown>(KEY, 'node');
    return (STACKS as unknown[]).includes(saved) ? (saved as Stack) : 'node';
  });
  useEffect(() => writeJson(KEY, stack), [stack]);
  const setStack = useCallback((s: Stack) => set(s), []);
  return <StackContext.Provider value={{ stack, setStack }}>{children}</StackContext.Provider>;
}

export const useStack = () => useContext(StackContext);
