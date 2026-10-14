// Top-level await makes this module asynchronous to load.
export const loadedAt = await Promise.resolve(new Date().toISOString());
