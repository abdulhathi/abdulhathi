import type { StaticPage } from '../apps';

export type Page = StaticPage;
export type AppStatus = { id: string; up: boolean; managed: boolean; pid?: number; startedAt?: number; setup?: string };
export type Result = { ok: boolean; message: string };

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as T | null;
  if (body === null) throw new Error(`The hub API answered ${res.status} without JSON. Is the hub running with "npm run dev"?`);
  return body;
}

export const getStatus = async () => json<AppStatus[]>(await fetch('/api/status'));
export const getPages = async () => json<Record<string, Page[]>>(await fetch('/api/pages'));
export const getLogs = async (id: string) => (await fetch(`/api/apps/${id}/logs`)).text();

/** POSTs carry X-Study-Hub so the API can tell them apart from requests made by other sites. */
export async function post(path: string): Promise<Result> {
  return json<Result>(await fetch(`/api/${path}`, { method: 'POST', headers: { 'X-Study-Hub': '1' } }));
}
