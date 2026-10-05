/* ads.js - loads adverts created in the admin page and shows them on the home page.
   Banners  -> slider inside #ad-banner-section
   Popups   -> modal shown once per browser session
   Needs: firebase-config.js (global `db`) loaded before this file. */

(function () {
  const section = document.getElementById("ad-banner-section");

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Same rule as the admin page: only http(s), tel and mailto links.
  function safeLink(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    if (/^(https?:|tel:|mailto:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.\-]*:/i.test(u)) return "";
    return "https://" + u.replace(/^\/+/, "");
  }

  function injectStyles() {
    const css = `
      .ad-banner-section{max-width:1200px;margin:32px auto;padding:0 16px}
      .ad-slider{position:relative;overflow:hidden;border-radius:14px;background:#eef1f6;aspect-ratio:16/5}
      .ad-slide{position:absolute;inset:0;opacity:0;transition:opacity .6s;display:block}
      .ad-slide.active{opacity:1;z-index:1}
      .ad-slide img{width:100%;height:100%;object-fit:cover;display:block}
      .ad-caption{position:absolute;left:0;right:0;bottom:0;padding:14px 18px;color:#fff;font-weight:600;
        background:linear-gradient(transparent,rgba(0,0,0,.65))}
      .ad-dots{position:absolute;bottom:10px;right:14px;display:flex;gap:6px;z-index:2}
      .ad-dot{width:9px;height:9px;border-radius:50%;border:0;padding:0;background:rgba(255,255,255,.55);cursor:pointer}
      .ad-dot.active{background:#fff}
      .ad-label{position:absolute;top:8px;left:10px;z-index:2;font-size:11px;background:rgba(0,0,0,.45);color:#fff;padding:2px 8px;border-radius:10px}
      .ad-popup-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
      .ad-popup{position:relative;max-width:480px;width:100%;background:#fff;border-radius:14px;overflow:hidden}
      .ad-popup img{width:100%;display:block}
      .ad-popup-caption{padding:12px 16px;font-weight:600}
      .ad-popup-close{position:absolute;top:8px;right:8px;width:32px;height:32px;border-radius:50%;border:0;
        background:rgba(0,0,0,.6);color:#fff;font-size:20px;line-height:1;cursor:pointer}
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function slideHTML(ad, i) {
    const link = safeLink(ad.link);
    const inner = `<img src="${esc(ad.imageUrl)}" alt="${esc(ad.caption || "Advert")}">` +
      (ad.caption ? `<div class="ad-caption">${esc(ad.caption)}</div>` : "");
    return link
      ? `<a class="ad-slide ${i === 0 ? "active" : ""}" href="${esc(link)}" target="_blank" rel="noopener sponsored">${inner}</a>`
      : `<div class="ad-slide ${i === 0 ? "active" : ""}">${inner}</div>`;
  }

  function renderBanners(banners) {
    if (!section || !banners.length) return;
    section.innerHTML = `
      <div class="ad-slider">
        <span class="ad-label">Ad</span>
        ${banners.map(slideHTML).join("")}
        ${banners.length > 1 ? `<div class="ad-dots">${banners.map((_, i) =>
          `<button type="button" class="ad-dot ${i === 0 ? "active" : ""}" data-i="${i}" aria-label="Show advert ${i + 1}"></button>`).join("")}</div>` : ""}
      </div>`;
    section.style.display = "block";

    if (banners.length < 2) return;
    const slides = section.querySelectorAll(".ad-slide");
    const dots = section.querySelectorAll(".ad-dot");
    let current = 0, timer;

    function show(n) {
      current = (n + slides.length) % slides.length;
      slides.forEach((s, i) => s.classList.toggle("active", i === current));
      dots.forEach((d, i) => d.classList.toggle("active", i === current));
    }
    function start() { timer = setInterval(() => show(current + 1), 5000); }
    function stop() { clearInterval(timer); }

    dots.forEach((d) => d.addEventListener("click", () => { stop(); show(Number(d.dataset.i)); start(); }));
    const slider = section.querySelector(".ad-slider");
    slider.addEventListener("mouseenter", stop);
    slider.addEventListener("mouseleave", start);
    start();
  }

  function renderPopup(ad) {
    try { if (sessionStorage.getItem("sanefi-popup-seen")) return; } catch (e) {}
    setTimeout(() => {
      const link = safeLink(ad.link);
      const img = `<img src="${esc(ad.imageUrl)}" alt="${esc(ad.caption || "Advert")}">`;
      const overlay = document.createElement("div");
      overlay.className = "ad-popup-overlay";
      overlay.innerHTML = `
        <div class="ad-popup">
          <button type="button" class="ad-popup-close" aria-label="Close">&times;</button>
          ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener sponsored">${img}</a>` : img}
          ${ad.caption ? `<div class="ad-popup-caption">${esc(ad.caption)}</div>` : ""}
        </div>`;
      const close = () => overlay.remove();
      overlay.querySelector(".ad-popup-close").addEventListener("click", close);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
      document.body.appendChild(overlay);
      try { sessionStorage.setItem("sanefi-popup-seen", "1"); } catch (e) {}
    }, 2500);
  }

  function init() {
    if (typeof db === "undefined") { console.error("ads.js: Firestore `db` not found. Is firebase-config.js loaded?"); return; }
    injectStyles();

    // Only orders by one field, so no composite index is needed. Filtering happens here.
    db.collection("ads").orderBy("createdAt", "desc").get()
      .then((snap) => {
        const ads = snap.docs.map((d) => d.data()).filter((a) => a.active !== false && a.imageUrl);
        renderBanners(ads.filter((a) => a.placement !== "popup"));
        const popups = ads.filter((a) => a.placement === "popup");
        if (popups.length) renderPopup(popups[0]);
      })
      .catch((err) => console.error("ads.js: couldn't load adverts:", err.code, err.message));
  }

  init();
})();
