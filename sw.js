// ============================================
// sw.js：Service Worker（在背景幫 App 管理檔案）
// - 有網路：每次都先問 GitHub 有沒有新版本，有就用新的（不受 10 分鐘快取影響）
// - 沒網路：用上次存好的檔案，App 還是打得開
// 只管這個網站自己的檔案；跟 AI 溝通的請求不經過這裡
// ============================================

const 快取名稱 = "theo-diary";

// 新版的 Service Worker 裝好就馬上接手，不用等舊的關掉
self.addEventListener("install", function () {
  self.skipWaiting();
});
self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  const isOwnFile = request.method === "GET" && new URL(request.url).origin === self.location.origin;
  if (!isOwnFile) return; // AI 的請求等等，交給瀏覽器自己處理

  event.respondWith(
    // cache: "no-cache"：一定要先問伺服器有沒有更新（沒更新的話很快，不會重新下載）
    fetch(request, { cache: "no-cache" })
      .then(function (response) {
        if (response.ok) {
          const copy = response.clone();
          caches.open(快取名稱).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      })
      .catch(function () {
        // 沒網路：用存好的
        return caches.match(request, { ignoreSearch: true });
      })
  );
});
