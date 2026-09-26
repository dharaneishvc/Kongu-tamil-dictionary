/** PWA chrome shared by every page: online/offline badge, install prompt and update banner. */
const networkStatus = document.getElementById('network-status');
const networkLabel = networkStatus?.querySelector('[data-network-label]');
const installButton = document.querySelector('[data-action="install-app"]');
const updateNotice = document.getElementById('update-notice');
const updateButton = document.querySelector('[data-action="apply-update"]');
const dismissUpdateButton = document.querySelector('[data-action="dismiss-update"]');

let installPrompt = null;
let waitingWorker = null;
let applyingUpdate = false;

function renderNetworkStatus() {
  const online = navigator.onLine;
  if (networkStatus) networkStatus.dataset.online = String(online);
  if (networkLabel) networkLabel.textContent = online ? 'இணையத்தில் · Online' : 'இணையமில்லை · Offline';
}

function showUpdate(worker) {
  waitingWorker = worker;
  if (updateNotice) updateNotice.hidden = false;
}

renderNetworkStatus();
addEventListener('online', renderNetworkStatus);
addEventListener('offline', renderNetworkStatus);

addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  if (installButton) installButton.hidden = false;
});

addEventListener('appinstalled', () => {
  installPrompt = null;
  if (installButton) installButton.hidden = true;
});

installButton?.addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});

updateButton?.addEventListener('click', () => {
  if (!waitingWorker) return;
  applyingUpdate = true;
  updateButton.disabled = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
});

dismissUpdateButton?.addEventListener('click', () => {
  if (updateNotice) updateNotice.hidden = true;
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applyingUpdate) location.reload();
  });

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      if (registration.waiting) showUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker);
        });
      });

      // update checks fail while offline; the next online/visible event retries
      const checkForUpdate = () => registration.update().catch(() => {});
      checkForUpdate();
      addEventListener('online', checkForUpdate);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    })
    .catch(() => {});
}
