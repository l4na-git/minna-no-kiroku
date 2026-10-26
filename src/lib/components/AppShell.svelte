<script lang="ts">
  import type { Snippet } from 'svelte';
  import './app.css';
  let { title, tab, back, children, action }: {
    title: string; tab?: 'timeline' | 'summary' | 'settings'; back?: { href: string; label: string; onClick?: () => void };
    children: Snippet; action?: Snippet;
  } = $props();
</script>

<svelte:head><title>{title} | みんなのきろく</title></svelte:head>
<div class="app-shell">
  <header class="bar">
    <div>{#if back}<a class="header-link" href={back.href} onclick={back.onClick}>{back.label}</a>{/if}</div>
    <h1>{title}</h1>
    <div class="bar-right">{#if action}{@render action()}{/if}</div>
  </header>
  <main class:has-tabs={!!tab} class:has-fab={tab === 'timeline' || tab === 'summary'}>
    {@render children()}
  </main>
  {#if tab === 'timeline' || tab === 'summary'}
    <div class="fab-wrap"><a class="fab" href="/entries/new"><span aria-hidden="true">＋</span> 記録する</a></div>
  {/if}
  {#if tab}
    <nav class="tabbar" aria-label="画面">
      <a href="/" aria-current={tab === 'timeline' ? 'page' : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9" /></svg>一覧</a>
      <a href="/summary" aria-current={tab === 'summary' ? 'page' : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7" /></svg>まとめ</a>
      <a href="/settings" aria-current={tab === 'settings' ? 'page' : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>設定</a>
    </nav>
  {/if}
</div>
