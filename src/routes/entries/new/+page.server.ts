import { redirect } from '@sveltejs/kit';
import { createCategory, createEntry, getDb, listCategories } from '#lib/server/db/index.ts';
import { formError, postedValues, readEntry } from '#lib/server/routes.ts';
import { currentDate } from '#lib/server/time.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({ categories: listCategories(getDb(), locals.user.id), today: currentDate(), userId: locals.user.id });

export const actions: Actions = {
  save: async ({ request, locals }) => {
    const form = await request.formData();
    try { createEntry(getDb(), locals.user.id, readEntry(form)); }
    catch (cause) { return formError(cause, postedValues(form)); }
    redirect(303, '/');
  },
  category: async ({ request, locals }) => {
    const form = await request.formData();
    try { createCategory(getDb(), locals.user.id, form.get('categoryName')); }
    catch (cause) { return formError(cause); }
    redirect(303, '/entries/new');
  }
};
