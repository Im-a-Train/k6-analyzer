async function loadPartial(container) {
  const src = container.dataset.partialSrc;
  if (!src) return;

  const response = await fetch(src, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load partial: ${src}`);
  }

  container.innerHTML = await response.text();
}

async function composePage() {
  const partialTargets = Array.from(document.querySelectorAll('[data-partial-src]'));
  await Promise.all(partialTargets.map((target) => loadPartial(target)));

  await import('./index-ui-builder.js');
  const appModule = await import('../app.js');

  if (typeof appModule.initializeApp === 'function') {
    await appModule.initializeApp();
  }
}

composePage().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre>Page composition failed: ${error.message}</pre>`;
});
