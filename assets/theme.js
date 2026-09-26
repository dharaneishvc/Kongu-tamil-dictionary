/** Colour theme shared by every page: applied before first paint, toggled by [data-action="theme"]. */
(() => {
  const KEY = 'kongu.theme';
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  root.dataset.theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-action="theme"]')) return;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* theme still applies for this visit */ }
  });
})();
