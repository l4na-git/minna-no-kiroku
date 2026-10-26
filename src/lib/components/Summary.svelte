<script lang="ts">
  import { untrack } from 'svelte';
  import AppShell from './AppShell.svelte';
  import { colorFor, monthLabel, shiftMonth, type Category, type Entry } from './types';
  let { entries, categories, today }: { entries: Pick<Entry, 'eventDate' | 'categoryId'>[]; categories: Category[]; today: string } = $props();
  let firstMonth = $derived(entries.length ? entries.map(e => e.eventDate.slice(0, 7)).sort()[0] : today.slice(0, 7));
  let lastMonth = $derived(today.slice(0, 7));
  let rangeStart = $state(untrack(() => shiftMonth(today.slice(0, 7), -2)));
  let selectedMonth = $state(untrack(() => today.slice(0, 7)));
  let sortedCategories = $derived([...categories].sort((a, b) => a.sortOrder - b.sortOrder));
  let months = $derived([rangeStart, shiftMonth(rangeStart, 1), shiftMonth(rangeStart, 2)].map(month => ({
    month, counts: sortedCategories.map(category => entries.filter(e => e.eventDate.startsWith(month) && e.categoryId === category.id).length),
    total: entries.filter(e => e.eventDate.startsWith(month)).length
  })));
  let maxCount = $derived(Math.max(1, ...months.map(m => m.total)));
  let selectedCounts = $derived(sortedCategories.map(category => ({ category, count: entries.filter(e => e.eventDate.startsWith(selectedMonth) && e.categoryId === category.id).length })));
  let selectedMax = $derived(Math.max(1, ...selectedCounts.map(c => c.count)));
</script>

<AppShell title="まとめ" tab="summary">
  {#if !entries.length}
    <div class="card empty"><p>まだ記録がありません。<br />記録がたまると、月ごと・カテゴリごとの件数を見られます。</p></div>
  {:else}
    <section class="card"><h2>月ごとの件数</h2>
      <div class="legend">{#each sortedCategories as category}<span><i style:background={colorFor(category.sortOrder)}></i>{category.name}</span>{/each}</div>
      <div class="bar-chart" aria-hidden="true">{#each months as month}<div class="bar-column"><span>{month.total}件</span><div class="stack">{#each month.counts as count, index}{#if count}<span style:height="{count / maxCount * 110}px" style:background={colorFor(sortedCategories[index].sortOrder)}></span>{/if}{/each}</div><span>{Number(month.month.slice(5))}月</span></div>{/each}</div>
      <div class="visually-hidden">{#each months as month}<p>{monthLabel(month.month)} {month.total}件。{#each sortedCategories as category, index}{category.name} {month.counts[index]}件。{/each}</p>{/each}</div>
      <div class="range-picker"><button type="button" onclick={() => rangeStart = shiftMonth(rangeStart, -3)} disabled={firstMonth >= rangeStart}>‹ 前の3か月</button><button type="button" onclick={() => rangeStart = shiftMonth(rangeStart, 3)} disabled={lastMonth <= shiftMonth(rangeStart, 2)}>次の3か月 ›</button></div>
    </section>
    <section class="card"><h2>カテゴリごとの件数</h2>
      <div class="month-picker"><button type="button" aria-label="先月を表示" disabled={selectedMonth <= firstMonth} onclick={() => selectedMonth = shiftMonth(selectedMonth, -1)}>‹</button><strong>{monthLabel(selectedMonth)}</strong><button type="button" aria-label="翌月を表示" disabled={selectedMonth >= lastMonth} onclick={() => selectedMonth = shiftMonth(selectedMonth, 1)}>›</button></div>
      <div class="category-bars">{#each selectedCounts as item}<div><div class="bar-label"><span><i style:background={colorFor(item.category.sortOrder)}></i>{item.category.name}</span><strong>{item.count}件</strong></div><div class="rail" aria-hidden="true"><div style:width="{item.count / selectedMax * 100}%" style:background={colorFor(item.category.sortOrder)}></div></div></div>{/each}</div>
    </section>
  {/if}
</AppShell>
<style>
  .legend { display:flex; flex-wrap:wrap; gap:8px 14px; font-size:.875rem; } .legend span,.bar-label span { display:inline-flex; align-items:center; gap:5px; } i { display:inline-block; width:12px; height:12px; border-radius:2px; flex:none; } .bar-chart { display:flex; align-items:flex-end; gap:12px; height:174px; border-bottom:1px solid var(--strong); margin-top:8px; } .bar-column { flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; font-size:.875rem; } .stack { height:110px; width:48px; max-width:80%; display:flex; flex-direction:column-reverse; justify-content:flex-start; } .stack span { display:block; width:100%; } .range-picker,.month-picker { display:flex; align-items:center; justify-content:space-between; gap:8px; } .range-picker button,.month-picker button { border:0; background:none; color:var(--accent); min-height:44px; padding:0 8px; cursor:pointer; } .range-picker button:disabled,.month-picker button:disabled { color:var(--muted); opacity:.55; cursor:default; } .month-picker button { font-size:1.5rem; } .category-bars { display:grid; gap:14px; } .bar-label { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px; font-size:.9375rem; } .rail { height:16px; background:var(--line); overflow:hidden; border-radius:4px; } .rail div { height:100%; }
</style>
