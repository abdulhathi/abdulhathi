import { HttpError } from './http-error.ts';
import type { NewBookmark } from './store.ts';

const isString = (value: unknown): value is string => typeof value === 'string';
const isHttpUrl = (value: string) => URL.canParse(value) && /^https?:$/.test(new URL(value).protocol);

/** Turns an unknown request body into a NewBookmark, or throws 422 listing every problem. */
export function parseNewBookmark(body: unknown): NewBookmark {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(422, 'Body must be a JSON object');
  }
  const input = body as Record<string, unknown>;

  const url = isString(input.url) && isHttpUrl(input.url) ? input.url : undefined;
  const title = isString(input.title) && input.title.trim() !== '' ? input.title.trim() : undefined;
  const tags = input.tags === undefined ? [] : Array.isArray(input.tags) && input.tags.every(isString) ? input.tags : undefined;

  if (url === undefined || title === undefined || tags === undefined) {
    const problems = [
      url === undefined && 'url must be an http or https URL',
      title === undefined && 'title must be a non-empty string',
      tags === undefined && 'tags must be an array of strings',
    ].filter(Boolean);
    throw new HttpError(422, 'Invalid bookmark', { details: problems });
  }
  return { url, title, tags };
}

/** For PATCH: every field is optional, but at least one must be present and valid. */
export function parseBookmarkPatch(body: unknown): Partial<NewBookmark> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(422, 'Body must be a JSON object');
  }
  const input = body as Record<string, unknown>;
  const changes: Partial<NewBookmark> = {};
  const problems: string[] = [];

  if (input.url !== undefined) {
    if (isString(input.url) && isHttpUrl(input.url)) changes.url = input.url;
    else problems.push('url must be an http or https URL');
  }
  if (input.title !== undefined) {
    if (isString(input.title) && input.title.trim() !== '') changes.title = input.title.trim();
    else problems.push('title must be a non-empty string');
  }
  if (input.tags !== undefined) {
    if (Array.isArray(input.tags) && input.tags.every(isString)) changes.tags = input.tags;
    else problems.push('tags must be an array of strings');
  }
  if (problems.length > 0) throw new HttpError(422, 'Invalid bookmark', { details: problems });
  if (Object.keys(changes).length === 0) throw new HttpError(422, 'Nothing to update');
  return changes;
}
