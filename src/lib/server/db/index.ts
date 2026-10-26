// DB 層の公開面。サーバー専用(src/lib/server/ 配下なのでブラウザ側には出ない)。
export { openDatabase, getDb, type AppDb, type OpenOptions } from './client';
export * from './errors';
export {
  findOrCreateUser,
  getUser,
  updateDisplayName,
  reassignAuthSubject,
  requireUser,
  type User
} from './users';
export { listCategories, createCategory, INITIAL_CATEGORIES, type Category } from './categories';
export {
  createEntry,
  getEntry,
  listEntries,
  updateEntry,
  deleteEntry,
  type EntryView,
  type EntryInput,
  type ListOptions
} from './entries';
export { monthlyCategoryCounts, type MonthlyCounts } from './stats';
export { PERIODS, type Period } from './schema';
