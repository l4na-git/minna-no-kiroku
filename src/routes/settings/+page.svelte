<script lang="ts">
  import Settings from '#lib/components/Settings.svelte';
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<Settings user={data.user} error={form && 'error' in form ? form.error : undefined} saved={form && 'saved' in form ? form.saved : false} />
