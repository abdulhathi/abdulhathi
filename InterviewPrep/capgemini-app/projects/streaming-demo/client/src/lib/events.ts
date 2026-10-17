// The run's event types (mirroring backend/app/runs.py) and a pure reducer that folds events into UI state.
// The reducer ignores any event it has already applied, so replays after a reconnect are harmless.

import type { SSEMessage } from './sse';

type Json = Record<string, unknown>;

export type RunEvent =
  | { id: number; type: 'run.started'; data: { prompt: string } }
  | { id: number; type: 'step.started'; data: { step_id: string; title: string } }
  | { id: number; type: 'token'; data: { step_id: string; text: string } }
  | { id: number; type: 'tool.call'; data: { step_id: string; tool: string; args: Json } }
  | { id: number; type: 'tool.result'; data: { step_id: string; tool: string; result: Json } }
  | { id: number; type: 'approval.required'; data: { step_id: string; action: string; details: Json; timeout_s: number; expires_at_ms?: number } }
  | { id: number; type: 'approval.resolved'; data: { step_id: string; approved: boolean; decided_by: 'user' | 'timeout' } }
  | { id: number; type: 'step.skipped'; data: { step_id: string; reason: string } }
  | { id: number; type: 'step.completed'; data: { step_id: string } }
  | { id: number; type: 'run.completed'; data: Json }
  | { id: number; type: 'run.cancelled'; data: { reason: string } }
  | { id: number; type: 'run.failed'; data: { error: string } };

export type RunEventType = RunEvent['type'];
const KNOWN = new Set<string>([
  'run.started', 'step.started', 'token', 'tool.call', 'tool.result', 'approval.required', 'approval.resolved',
  'step.skipped', 'step.completed', 'run.completed', 'run.cancelled', 'run.failed',
]);
export const TERMINAL = new Set<string>(['run.completed', 'run.cancelled', 'run.failed']);

/** SSE message → RunEvent, or null for comments, unknown types (newer servers) and malformed data. */
export function toRunEvent(message: SSEMessage): RunEvent | null {
  const id = Number(message.id);
  if (!KNOWN.has(message.event) || !Number.isInteger(id) || id < 1) return null;
  try {
    const data: unknown = JSON.parse(message.data);
    if (typeof data !== 'object' || data === null) return null;
    return { id, type: message.event, data } as RunEvent;
  } catch {
    return null;
  }
}

export type ToolCall = { tool: string; args: Json; result?: Json };
export type Step = { id: string; title: string; status: 'running' | 'done' | 'skipped'; text: string; tools: ToolCall[] };
export type Approval = { stepId: string; action: string; details: Json; deadline: number };
export type RunStatus = 'idle' | 'running' | 'awaiting_approval' | 'completed' | 'cancelled' | 'failed';

export type RunState = {
  lastEventId: number;
  status: RunStatus;
  prompt: string;
  steps: Step[];
  approval: Approval | null;
  outcome: string; // why it stopped: a cancel reason, an error, or "" while running / after success
  announcement: string; // short text for the aria-live region; tokens never go here
};

export const initialRunState: RunState = {
  lastEventId: 0,
  status: 'idle',
  prompt: '',
  steps: [],
  approval: null,
  outcome: '',
  announcement: '',
};

const updateStep = (steps: Step[], id: string, change: (s: Step) => Step) => steps.map((s) => (s.id === id ? change(s) : s));

export function applyEvent(state: RunState, event: RunEvent, now = Date.now()): RunState {
  if (event.id <= state.lastEventId) return state; // already applied (a replay after reconnecting)
  const next: RunState = { ...state, lastEventId: event.id };
  switch (event.type) {
    case 'run.started':
      return { ...next, status: 'running', prompt: event.data.prompt, announcement: 'Run started' };
    case 'step.started':
      return {
        ...next,
        steps: [...state.steps, { id: event.data.step_id, title: event.data.title, status: 'running', text: '', tools: [] }],
        announcement: `${event.data.title} started`,
      };
    case 'token':
      return { ...next, steps: updateStep(state.steps, event.data.step_id, (s) => ({ ...s, text: s.text + event.data.text })) };
    case 'tool.call':
      return {
        ...next,
        steps: updateStep(state.steps, event.data.step_id, (s) => ({ ...s, tools: [...s.tools, { tool: event.data.tool, args: event.data.args }] })),
        announcement: `Calling ${event.data.tool}`,
      };
    case 'tool.result':
      return {
        ...next,
        steps: updateStep(state.steps, event.data.step_id, (s) => ({
          ...s,
          tools: s.tools.map((t, i) => (i === s.tools.length - 1 && t.tool === event.data.tool ? { ...t, result: event.data.result } : t)),
        })),
      };
    case 'approval.required': {
      // Prefer the server's absolute deadline: now + timeout_s alone would restart the countdown on every replay
      // (a reload, a second tab). Capped at a full timeout from now, so a client clock running behind the server's
      // never shows more time than the server will actually wait.
      const full = now + event.data.timeout_s * 1000;
      const deadline = event.data.expires_at_ms === undefined ? full : Math.min(event.data.expires_at_ms, full);
      return {
        ...next,
        status: 'awaiting_approval',
        approval: { stepId: event.data.step_id, action: event.data.action, details: event.data.details, deadline },
        announcement: `Approval needed: ${event.data.action.replaceAll('_', ' ')}`,
      };
    }
    case 'approval.resolved':
      return {
        ...next,
        status: 'running',
        approval: null,
        announcement: event.data.approved ? 'Approved' : event.data.decided_by === 'timeout' ? 'Approval timed out' : 'Rejected',
      };
    case 'step.skipped':
      return { ...next, steps: updateStep(state.steps, event.data.step_id, (s) => ({ ...s, status: 'skipped' })) };
    case 'step.completed':
      return { ...next, steps: updateStep(state.steps, event.data.step_id, (s) => (s.status === 'skipped' ? s : { ...s, status: 'done' })) };
    case 'run.completed':
      return { ...next, status: 'completed', approval: null, announcement: 'Run completed' };
    case 'run.cancelled':
      return { ...next, status: 'cancelled', approval: null, outcome: event.data.reason, announcement: `Run cancelled: ${event.data.reason}` };
    case 'run.failed':
      return { ...next, status: 'failed', approval: null, outcome: event.data.error, announcement: 'Run failed' };
  }
}

export const applyEvents = (state: RunState, events: RunEvent[]) => events.reduce((s, e) => applyEvent(s, e), state);
