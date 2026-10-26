<script lang="ts">
  import AppShell from './AppShell.svelte';
  import Avatar from './Avatar.svelte';
  import { dateLabel, periodLabel, timestampLabel, type Entry } from './types';
  let { entry, userId, timeZone = 'Asia/Tokyo', error }: { entry: Entry; userId: string; timeZone?: string; error?: string } = $props();
</script>

<AppShell title="記録" back={{ href: '/', label: '‹ 一覧' }}>
  {#snippet action()}{#if entry.authorId === userId}<a class="header-link" href="/entries/{encodeURIComponent(entry.id)}/edit">編集</a>{/if}{/snippet}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <article class="card"><p class="date">いつあったことか: {dateLabel(entry.eventDate)}</p><p class="muted">{entry.categoryName}{entry.eventPeriod ? `・${periodLabel(entry.eventPeriod)}` : ''}</p><div class="who"><Avatar name={entry.authorName} color={entry.authorColor} /><strong>{entry.authorName}</strong></div><p class="body">{entry.body}</p><p class="muted">記録した日時: {timestampLabel(entry.createdAt, timeZone)}</p>{#if entry.editedAt}<p class="muted">編集済み（{timestampLabel(entry.editedAt, timeZone)}）</p>{/if}</article>
  {#if entry.authorId === userId}<details class="card deletion"><summary>この記録を削除する</summary><p>削除すると、元に戻せません。</p><form method="POST" action="?/delete"><button type="submit" class="button danger">削除する</button></form></details>{/if}
</AppShell>
<style>
  .date { font-weight:700; margin:0; } .who { display:flex; align-items:center; gap:10px; margin-top:20px; } .body { white-space:pre-wrap; overflow-wrap:anywhere; margin:20px 0; } .deletion { margin-top:30px; } summary { color:var(--danger); cursor:pointer; min-height:44px; }
</style>
