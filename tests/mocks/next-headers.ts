import { vi } from "vitest";

interface CookieRecord {
  name: string;
  value: string;
}

const store = new Map<string, string>();

export function resetCookieStore() {
  store.clear();
}

export const cookies = vi.fn(async () => ({
  get(name: string): CookieRecord | undefined {
    const value = store.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set(name: string, value: string) {
    store.set(name, value);
  },
  delete(name: string) {
    store.delete(name);
  },
}));
