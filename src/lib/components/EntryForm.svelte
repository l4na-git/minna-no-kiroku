<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import AppShell from './AppShell.svelte';
  import type { Category, Entry, EntryValues, EventPeriod } from './types';
  let { categories, today, userId, entry, error, values }: { categories: Category[]; today: string; userId: string; entry?: Entry; error?: string; values?: EntryValues } = $props();
  const draftKey = untrack(() => `minna-no-kiroku:entry-draft:${userId}:${entry ? `edit:${entry.id}` : 'new'}`);
  let eventDate = $state(untrack(() => values?.eventDate ?? entry?.eventDate ?? today));
  let eventPeriod = $state<EventPeriod>(untrack(() => values ? (['morning', 'afternoon', 'evening', 'night'].includes(values.eventPeriod ?? '') ? values.eventPeriod as EventPeriod : null) : entry?.eventPeriod ?? null));
  let categoryId = $state(untrack(() => values?.categoryId ?? entry?.categoryId ?? ''));
  let body = $state(untrack(() => values?.body ?? entry?.body ?? ''));
  const version = untrack(() => entry ? (values?.version && /^\d+$/.test(values.version) ? Number(values.version) : entry.editedAt ?? entry.createdAt) : null);
  let staleDraft = $state<{ body: string; eventDate: string; eventPeriod: string; categoryId: string } | null>(null);
  let mounted = $state(false);
  onMount(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (draft && typeof draft === 'object') {
        if (entry && draft.version !== version) {
          staleDraft = { body: typeof draft.body === 'string' ? draft.body : '', eventDate: typeof draft.eventDate === 'string' ? draft.eventDate : '', eventPeriod: typeof draft.eventPeriod === 'string' ? draft.eventPeriod : '', categoryId: typeof draft.categoryId === 'string' ? draft.categoryId : '' };
        } else {
        if (typeof draft.eventDate === 'string') eventDate = draft.eventDate;
        if (draft.eventPeriod === null || ['morning', 'afternoon', 'evening', 'night'].includes(draft.eventPeriod)) eventPeriod = draft.eventPeriod;
        if (typeof draft.categoryId === 'string') categoryId = draft.categoryId;
        if (typeof draft.body === 'string') body = draft.body;
        }
      }
    } catch { /* Storage may be unavailable or contain an old draft. */ }
    mounted = true;
  });
  $effect(() => {
    if (mounted && !staleDraft) {
      try { localStorage.setItem(draftKey, JSON.stringify({ eventDate, eventPeriod, categoryId, body, version })); } catch { /* Storage is optional. */ }
    }
  });
  function clearDraft() { try { localStorage.removeItem(draftKey); } catch { /* Storage is optional. */ } }
  const periods: { value: Exclude<EventPeriod, null>; label: string }[] = [{ value: 'morning', label: '朝' }, { value: 'afternoon', label: '昼' }, { value: 'evening', label: '夕方' }, { value: 'night', label: '夜' }];
</script>

<AppShell title={entry ? '記録を編集' : '記録する'} back={{ href: entry ? `/entries/${encodeURIComponent(entry.id)}` : '/', label: 'キャンセル', onClick: clearDraft }}>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if staleDraft}
    <div class="card" role="alert"><p>記録が更新されているため、以前の書きかけは自動では適用しません。必要な内容をコピーしてから破棄し、最新の記録を編集してください。</p><p>日付: {staleDraft.eventDate}　時間帯: {staleDraft.eventPeriod || '未選択'}　カテゴリ: {categories.find(c => c.id === staleDraft?.categoryId)?.name ?? '未選択'}</p><label class="field" for="stale-body">以前の書きかけ</label><textarea id="stale-body" class="input" readonly value={staleDraft.body}></textarea><button type="button" class="button secondary block" onclick={() => { clearDraft(); staleDraft = null; }}>書きかけを破棄して最新の記録を編集</button></div>
  {:else}
  <form method="POST" action="?/save" use:enhance={() => async ({ result, update }) => { if (result.type === 'redirect' || result.type === 'success') clearDraft(); await update(); }}>
    {#if entry}<input type="hidden" name="version" value={version} />{/if}
    <div class="form-group"><label class="field" for="event-date">いつあったことか（必須）</label><input class="input" id="event-date" type="date" name="eventDate" bind:value={eventDate} max={today} required /></div>
    <fieldset class="form-group"><legend>いつ頃か（任意）</legend><div class="choice-grid period-grid">{#each periods as period}<label class="choice"><input type="radio" name="eventPeriod" value={period.value} checked={eventPeriod === period.value} onchange={() => eventPeriod = period.value} /><span>{period.label}</span></label>{/each}</div><button type="button" class="clear" onclick={() => eventPeriod = null}>時間帯を選択しない</button></fieldset>
    <fieldset class="form-group"><legend>どんなことか（必須）</legend><div class="choice-grid">{#each categories as category}<label class="choice"><input type="radio" name="categoryId" value={category.id} bind:group={categoryId} required /><span>{category.name}</span></label>{/each}</div></fieldset>
    <div class="form-group"><label class="field" for="body">気になったことを、思いついたまま書いてください。（必須）</label><textarea class="input" id="body" name="body" bind:value={body} maxlength="10000" required placeholder="例: 昨日の夜、さっき話したことをまた聞かれた。"></textarea></div>
    <div class="footbar"><button class="button block" type="submit">保存する</button></div>
  </form>
  <details class="add-category"><summary>＋ 新しいカテゴリ</summary><form method="POST" action="?/category"><label class="field" for="category-name">カテゴリ名</label><input class="input" id="category-name" name="categoryName" maxlength="20" required /><button class="button secondary" type="submit">カテゴリを追加</button></form></details>
  {#if !entry}<a class="cancel" href="/" onclick={clearDraft}>書きかけを破棄してキャンセル</a>{/if}
  {/if}
</AppShell>
<style>
  .clear { background:none; border:0; color:var(--accent); min-height:44px; padding:0 2px; cursor:pointer; font-size:.875rem; } .add-category { margin:20px 0; } summary { color:var(--accent); min-height:44px; cursor:pointer; } .add-category form { display:grid; gap:8px; } .cancel { display:inline-block; min-height:44px; padding:10px 0; margin-bottom:80px; } .footbar { position:fixed; z-index:4; bottom:0; left:50%; transform:translateX(-50%); width:min(100%,42rem); padding:10px 16px calc(10px + env(safe-area-inset-bottom)); background:var(--surface); border-top:1px solid var(--line); }
</style>
