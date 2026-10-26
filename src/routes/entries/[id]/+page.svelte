<script lang="ts">
  import EntryDetail from '#lib/components/EntryDetail.svelte';
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<EntryDetail entry={data.entry} userId={data.userId} timeZone={data.timeZone} error={form?.error} />
