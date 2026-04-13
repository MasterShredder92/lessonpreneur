/** Supabase client module expects `window` (browser singleton). Vitest runs in Node. */
;(globalThis as unknown as { window: typeof globalThis }).window = globalThis
