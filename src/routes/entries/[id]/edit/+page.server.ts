import { redirect } from '@sveltejs/kit';
import { createCategory, getDb, listCategories, updateEntry, ValidationError } from '#lib/server/db/index.ts';
import { displayEntry, formError, postedValues, readEntry, requireEntry } from '#lib/server/routes.ts';
import { currentDate } from '#lib/server/time.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
  const entry = requireEntry(locals.user.id, params.id, true);
  const categories = listCategories(getDb(), locals.user.id);
  return { entry: displayEntry(entry, categories), categories, today: currentDate(), userId: locals.user.id };
};

export const actions: Actions = {
  save: async ({ request, locals, params }) => {
    const form = await request.formData();
    const version = form.get('version');
    if (typeof version !== 'string' || !/^\d+$/.test(version) || !Number.isSafeInteger(Number(version))) return formError(new ValidationError('version', '記録の状態を確認できません。再読み込みしてください。'), postedValues(form));
    try { updateEntry(getDb(), locals.user.id, params.id, readEntry(form), Number(version)); }
    catch (cause) { return formError(cause, postedValues(form)); }
    redirect(303, `/entries/${params.id}`);
  },
  category: async ({ request, locals, params }) => {
    requireEntry(locals.user.id, params.id, true);
    const form = await request.formData();
    try { createCategory(getDb(), locals.user.id, form.get('categoryName')); }
    catch (cause) { return formError(cause); }
    redirect(303, `/entries/${params.id}/edit`);
  }
};
