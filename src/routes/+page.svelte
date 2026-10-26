<script lang="ts">
  import Timeline from '#lib/components/Timeline.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<Timeline entries={data.entries} today={data.today} timeZone={data.timeZone} />
