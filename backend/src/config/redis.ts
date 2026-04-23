// DEPRECATED: Migrated to Firestore. Redis is no longer used.
// This file is kept as a stub to prevent compilation errors from any lingering imports.
export const redis = {
  get: async (_key: string) => null,
  setex: async (_key: string, _ttl: number, _value: string) => {},
  quit: async () => {},
};
