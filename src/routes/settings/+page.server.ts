import { getDb, getUser, updateDisplayName } from '#lib/server/db/index.ts';
import { formError } from '#lib/server/routes.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({ user: getUser(getDb(), locals.user.id)! });

export const actions: Actions = {
  save: async ({ request, locals }) => {
    const form = await request.formData();
    try { updateDisplayName(getDb(), locals.user.id, form.get('displayName')); }
    catch (cause) { return formError(cause); }
    return { saved: true };
  }
};
