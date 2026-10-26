import type { PageServerLoad } from './$types';
import { getDb, listCategories, listEntries } from '#lib/server/db/index.ts';
import { currentDate } from '#lib/server/time.ts';

export const load: PageServerLoad = ({ locals }) => {
  const db = getDb();
  const categories = listCategories(db, locals.user.id);
  return { categories, entries: listEntries(db, locals.user.id).map(({ eventDate, categoryId }) => ({ eventDate, categoryId })), today: currentDate() };
};
