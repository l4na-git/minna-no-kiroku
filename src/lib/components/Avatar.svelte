<script lang="ts">
  import { colorFor } from './types';
  let { name, color }: { name: string; color: number } = $props();
</script>

<span class="avatar" style:background={colorFor(color)} aria-hidden="true">{Array.from(name)[0] ?? '？'}</span>
