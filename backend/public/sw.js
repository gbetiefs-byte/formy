"use strict";

// KILL SWITCH — désenregistre définitivement le service worker et vide tout
// cache qu'il aurait pu créer, puis force chaque page ouverte à recharger.
//
// La fonctionnalité "consultation hors-ligne" a causé plus de mal que de
// bien pendant le développement actif (versions périmées de app.js servies
// indéfiniment) : elle est retirée. Ce fichier reste en place — et continuera
// d'être servi à /sw.js — uniquement pour nettoyer les navigateurs qui ont
// encore l'ancien service worker actif. Ne plus y ajouter de logique de cache.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();

      const clientsList = await self.clients.matchAll({ type: "window" });
      for (const client of clientsList) {
        client.navigate(client.url);
      }
    })()
  );
});
