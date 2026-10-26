<script lang="ts">
  import { untrack } from 'svelte';
  import AppShell from './AppShell.svelte';
  import Avatar from './Avatar.svelte';
  import type { User } from './types';
  let { user, error, saved = false }: { user: User; error?: string; saved?: boolean } = $props();
  let displayName = $state(untrack(() => user.displayName));
  function clearDraft() {
    try {
      const prefix = `minna-no-kiroku:entry-draft:${user.id}:`;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) localStorage.removeItem(key);
      }
    } catch { /* Storage is optional. */ }
  }
</script>
<AppShell title="設定" tab="settings">
  {#if error}<p class="error" role="alert">{error}</p>{/if}{#if saved}<p role="status">表示名を保存しました。</p>{/if}
  <form class="card" method="POST" action="?/save"><div class="who"><Avatar name={user.displayName} color={user.color} /><strong>{user.displayName}</strong></div><label class="field" for="display-name">表示名</label><input class="input" id="display-name" name="displayName" bind:value={displayName} maxlength="20" required /><button class="button block" type="submit">保存する</button></form>
  <div class="card"><span class="field">メールアドレス</span><strong>{user.email}</strong></div>
  <a class="button secondary block" href="/cdn-cgi/access/logout" onclick={clearDraft}>ログアウト</a>
</AppShell>
<style>.who { display:flex; gap:10px; align-items:center; margin-bottom:20px; } form .button { margin-top:12px; }</style>
