<script lang="ts">
  import { page } from '$app/state';
  import AppShell from './AppShell.svelte';
  import Avatar from './Avatar.svelte';
  import { dateLabel, periodLabel, timestampLabel, type Entry } from './types';
  let { entries, today, timeZone = 'Asia/Tokyo' }: { entries: Entry[]; today: string; timeZone?: string } = $props();
  let period = $derived(page.url.searchParams.get('period') ?? 'month');
  let order = $derived(page.url.searchParams.get('order') === 'asc' ? 'asc' : 'desc');
  let start = $derived(page.url.searchParams.get('from') ?? '');
  let end = $derived(page.url.searchParams.get('to') ?? '');
  function previousDate(date: string, months: number, days = 0) {
    const [y, m, d] = date.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1 - months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay) - days);
    return target.toISOString().slice(0, 10);
  }
  let lower = $derived(period === 'all' ? '' : period === 'custom' ? start : previousDate(today, period === 'three' ? 3 : period === 'week' ? 0 : 1, period === 'week' ? 6 : 0));
  let upper = $derived(period === 'all' ? '' : period === 'custom' ? end : today);
  let filtered = $derived(entries.filter(e => (!lower || e.eventDate >= lower) && (!upper || e.eventDate <= upper)).sort((a, b) => {
    const c = a.eventDate.localeCompare(b.eventDate) || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
    return order === 'asc' ? c : -c;
  }));
  let dates = $derived([...new Set(filtered.map(e => e.eventDate))]);
  let rangeLabel = $derived(period === 'all' ? 'すべて' : `${lower || '指定なし'} 〜 ${upper || '指定なし'}`);
</script>

<AppShell title="一覧" tab="timeline">
  <div class="print-only"><h1>みんなのきろく</h1><p>期間: {rangeLabel} ／ {filtered.length}件 ／ {order === 'asc' ? '古い順' : '新しい順'}</p><p>出力日: {dateLabel(today)}</p></div>
  {#if entries.length}
    <form method="GET" class="card no-print controls">
      <label class="field" for="period">期間</label>
      <select class="input" id="period" name="period" bind:value={period}>
        <option value="week">直近1週間</option><option value="month">直近1か月</option><option value="three">直近3か月</option><option value="all">すべて</option><option value="custom">日付を指定</option>
      </select>
      {#if period === 'custom'}<div class="dates"><label>開始日<input class="input" type="date" name="from" bind:value={start} max={end || today} required /></label><label>終了日<input class="input" type="date" name="to" bind:value={end} min={start} max={today} required /></label></div>{/if}
      <label class="field" for="order">並び順</label>
      <select class="input" id="order" name="order"><option value="desc" selected={order === 'desc'}>新しい順</option><option value="asc" selected={order === 'asc'}>古い順</option></select>
      <div class="actions"><button class="button secondary" type="submit">表示する</button><button class="button secondary" type="button" onclick={() => window.print()}>印刷 / PDFにする</button></div>
    </form>
    <p class="muted no-print">{filtered.length}件</p>
  {/if}
  {#if !entries.length}
    <div class="card empty"><p>まだ記録がありません。<br />気になったことがあれば、最初の1件を書いてみましょう。</p><a class="button block" href="/entries/new">記録する</a></div>
  {:else if !filtered.length}
    <div class="card empty"><p>この期間の記録はありません。</p></div>
  {:else}
    {#each dates as date}
      <section><h2 class="day">{dateLabel(date)}</h2>
        <ul class="entry-list">{#each filtered.filter(e => e.eventDate === date) as entry (entry.id)}
          <li class="entry-card"><a href="/entries/{encodeURIComponent(entry.id)}" class="entry-link">
            <Avatar name={entry.authorName} color={entry.authorColor} />
            <div class="entry-content"><div class="entry-meta"><span>{entry.categoryName}{entry.eventPeriod ? `・${periodLabel(entry.eventPeriod)}` : ''}</span><strong>{entry.authorName}</strong><time>{timestampLabel(entry.createdAt, timeZone)}</time></div><p class="entry-body">{entry.body}</p>{#if entry.editedAt}<small class="muted">編集済み</small>{/if}</div>
          </a></li>
        {/each}</ul>
      </section>
    {/each}
  {/if}
</AppShell>

<style>
  .controls .field { margin-top:12px; } .controls .field:first-child { margin-top:0; } .dates { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; font-size:.875rem; } .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
  .day { margin:20px 4px 6px; color:var(--muted); font-size:.9375rem; } .entry-list { list-style:none; padding:0; margin:0; background:var(--surface); border-radius:12px; } .entry-card + .entry-card { border-top:1px solid var(--line); } .entry-link { display:flex; gap:12px; padding:16px; color:var(--text); text-decoration:none; } .entry-content { min-width:0; flex:1; } .entry-meta { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 10px; font-size:.875rem; color:var(--muted); } .entry-meta strong { color:var(--text); } .entry-body { white-space:pre-wrap; overflow-wrap:anywhere; margin:5px 0 0; display:-webkit-box; line-clamp:3; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
</style>
