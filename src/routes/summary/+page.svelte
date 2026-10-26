<script lang="ts">
  import Summary from '#lib/components/Summary.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<Summary entries={data.entries} categories={data.categories} today={data.today} />
