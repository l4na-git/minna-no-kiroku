import type { PageServerLoad } from './$types';
import { getDb, listCategories, listEntries } from '#lib/server/db/index.ts';
import { displayEntry } from '#lib/server/routes.ts';
import { currentDate, timeZone } from '#lib/server/time.ts';

export const load: PageServerLoad = ({ locals }) => {
  const db = getDb();
  const categories = listCategories(db, locals.user.id);
  return { user: locals.user, entries: listEntries(db, locals.user.id).map((entry) => displayEntry(entry, categories)), today: currentDate(), timeZone: timeZone() };
};
