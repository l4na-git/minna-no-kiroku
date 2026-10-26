<script lang="ts">
  import '#lib/components/app.css';
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';
  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  // 自動で消すのは JavaScript が動いたときだけ。動かなければ、通知は次の画面に移るまで残る。
  const VISIBLE_MS = 4000;
  const FADE_MS = 400; // app.css の .flash の transition と合わせる
  let leaving = $state(false);
  let dismissed = $state(false);
  $effect(() => {
    leaving = false;
    dismissed = false;
    if (!data.flash) return;
    const fade = setTimeout(() => { leaving = true; }, VISIBLE_MS);
    const remove = setTimeout(() => { dismissed = true; }, VISIBLE_MS + FADE_MS);
    return () => { clearTimeout(fade); clearTimeout(remove); };
  });

  // JavaScript がなければ、同じ URL への普通のリンクとして読み直す(通知の Cookie は読んだ時点で消えている)。
  // 動くときは移動せず、その場で閉じる。修飾キー付きやマウスの中ボタンは、ブラウザの動作に任せる。
  const reloadHref = $derived(page.url.pathname + page.url.search);
  function close(event: MouseEvent) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dismissed = true;
  }
</script>

<!-- ヘッダー直下に固定して置く。status の領域は常に置き、内容が入ったときに支援技術へ伝える(「閉じる」は読み上げに含めない)。
     領域そのものはクリックを下の要素へ通し、「閉じる」だけが操作を受ける。 -->
<div class="flash-region no-print">
  <div role="status">{#if data.flash && !dismissed}<p class="flash" class:leaving>{data.flash}</p>{/if}</div>
  {#if data.flash && !dismissed}<a class="flash-close" class:leaving href={reloadHref} aria-label="通知を閉じる" onclick={close}>閉じる</a>{/if}
</div>
{@render children()}
