<script lang="ts">
  import EntryForm from '#lib/components/EntryForm.svelte';
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<EntryForm categories={data.categories} today={data.today} userId={data.userId} entry={data.entry} error={form?.error} values={form?.values} />
