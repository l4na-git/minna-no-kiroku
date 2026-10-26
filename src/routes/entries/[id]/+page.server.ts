import { redirect } from '@sveltejs/kit';
import { deleteEntry, getDb, listCategories } from '#lib/server/db/index.ts';
import { setFlash } from '#lib/server/flash.ts';
import { displayEntry, formError, requireEntry } from '#lib/server/routes.ts';
import { timeZone } from '#lib/server/time.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => ({
  entry: displayEntry(requireEntry(locals.user.id, params.id), listCategories(getDb(), locals.user.id)), userId: locals.user.id, timeZone: timeZone()
});

export const actions: Actions = {
  delete: ({ locals, params, cookies }) => {
    try { deleteEntry(getDb(), locals.user.id, params.id); }
    catch (cause) { return formError(cause); }
    setFlash(cookies, 'deleted');
    redirect(303, '/');
  }
};
