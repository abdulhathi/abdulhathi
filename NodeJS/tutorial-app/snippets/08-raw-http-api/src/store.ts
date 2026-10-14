import { randomUUID } from 'node:crypto';

export type Bookmark = {
  id: string;
  url: string;
  title: string;
  tags: string[];
  createdAt: string;
};

export type NewBookmark = Pick<Bookmark, 'url' | 'title' | 'tags'>;

/** Keeps bookmarks in memory. They disappear when the process stops; chapter 12 adds a database. */
export class BookmarkStore {
  #items = new Map<string, Bookmark>();

  list(tag?: string): Bookmark[] {
    const all = [...this.#items.values()];
    return tag ? all.filter((b) => b.tags.includes(tag)) : all;
  }

  get(id: string): Bookmark | undefined {
    return this.#items.get(id);
  }

  create(input: NewBookmark): Bookmark {
    const bookmark = { id: randomUUID(), ...input, createdAt: new Date().toISOString() };
    this.#items.set(bookmark.id, bookmark);
    return bookmark;
  }

  delete(id: string): boolean {
    return this.#items.delete(id);
  }
}
