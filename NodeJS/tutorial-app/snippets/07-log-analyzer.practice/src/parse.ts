export type LogEntry = {
  time: string;
  method: string;
  path: string;
  status: number;
  ms: number;
};

/** Parses one line such as: 2026-10-11T09:00:00.123Z GET /api/tasks 200 31 */
export function parseLine(line: string): LogEntry | undefined {
  const [time, method, path, status, ms] = line.split(' ');
  if (!time || !method || !path || !status || !ms) return undefined;
  return { time, method, path, status: Number(status), ms: Number(ms) };
}
