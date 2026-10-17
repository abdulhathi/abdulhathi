import type { AppStatus } from '../lib/api';
import { stateOf } from '../lib/useHub';

const LABEL = {
  running: 'Running',
  external: 'Running, started outside the hub',
  starting: 'Starting…',
  stopped: 'Stopped',
  unknown: 'Checking…',
} as const;

export function StatusBadge({ status, short = false }: { status: AppStatus | undefined; short?: boolean }) {
  const state = stateOf(status);
  const label = short && state === 'external' ? 'Running' : LABEL[state];
  return (
    <span className={`status s-${state}`} title={LABEL[state]}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

export function StatusDot({ status }: { status: AppStatus | undefined }) {
  const state = stateOf(status);
  return <i className={`dot s-${state}`} role="img" aria-label={LABEL[state]} />;
}
