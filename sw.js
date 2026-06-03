self.addEventListener('fetch', (event) => {
    // Requisito mínimo para que Chromium valide la instalación offline
    event.respondWith(fetch(event.request));
});