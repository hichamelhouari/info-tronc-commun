/* ==========================================================================
   THÈME « Ardoise & Signal » — comportements communs
   Un seul fichier pour toutes les pages. Tout est activé par attribut :
     data-tc-theme-toggle   bouton clair/sombre
     data-tc-readbar        barre de progression de lecture
     data-tc-toc            sommaire généré depuis les h2/h3 de .tc-prose
     data-tc-quiz           QCM auto-corrigé
     data-tc-reveal="#id"   bouton « afficher la correction »
     data-tc-check          vérification d'une réponse courte
     data-tc-tabs           onglets
     data-tc-copy           bouton copier d'un bloc de code
     data-tc-filter="sel"   champ de recherche filtrant les éléments visés
     data-tc-done="id"      case « cours terminé » mémorisée dans le navigateur
   ========================================================================== */

(function () {
  "use strict";

  /* ---------------------------------------------------------- utilitaires */

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var store = {
    get: function (k, fb) {
      try { var v = localStorage.getItem("tc:" + k); return v === null ? fb : JSON.parse(v); }
      catch (e) { return fb; }
    },
    set: function (k, v) {
      try { localStorage.setItem("tc:" + k, JSON.stringify(v)); } catch (e) { /* mode privé */ }
    }
  };

  /* ------------------------------------------------- thème clair / sombre */

  function applyTheme(mode) {
    if (mode === "dark" || mode === "light") {
      document.documentElement.setAttribute("data-theme", mode);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    $$("[data-tc-theme-toggle]").forEach(function (b) {
      var dark = mode === "dark" ||
        (mode !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      b.setAttribute("aria-label", dark ? "Passer en thème clair" : "Passer en thème sombre");
      var sun = $(".tc-ico-sun", b), moon = $(".tc-ico-moon", b);
      if (sun) sun.hidden = !dark;
      if (moon) moon.hidden = dark;
    });
  }

  function initTheme() {
    applyTheme(store.get("theme", "auto"));
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tc-theme-toggle]");
      if (!btn) return;
      var dark = document.documentElement.getAttribute("data-theme") === "dark" ||
        (!document.documentElement.hasAttribute("data-theme") &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      var next = dark ? "light" : "dark";
      store.set("theme", next);
      applyTheme(next);
    });
  }

  /* --------------------------------------- barre de progression de lecture */

  function initReadbar() {
    var fill = $("[data-tc-readbar] .tc-readbar__fill");
    if (!fill) return;
    var tick = function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      var p = max > 0 ? (h.scrollTop || document.body.scrollTop) / max : 0;
      fill.style.width = Math.min(100, Math.max(0, p * 100)).toFixed(1) + "%";
    };
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    tick();
  }

  /* ------------------------------------- sommaire automatique + surlignage */

  function slug(txt, i) {
    var s = txt.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return s ? s.slice(0, 48) : "s" + i;
  }

  function initToc() {
    var holder = $("[data-tc-toc]");
    if (!holder) return;
    var scope = $(holder.getAttribute("data-tc-toc") || ".tc-prose");
    if (!scope) return;

    var heads = $$("h2, h3", scope).filter(function (h) { return !h.hasAttribute("data-tc-toc-skip"); });
    if (!heads.length) { holder.closest(".tc-toc") && (holder.closest(".tc-toc").hidden = true); return; }

    var ul = document.createElement("ul");
    ul.className = "tc-toc__list";

    heads.forEach(function (h, i) {
      if (!h.id) h.id = slug(h.textContent, i);
      var li = document.createElement("li");
      if (h.tagName === "H3") li.className = "tc-toc--sub";
      var a = document.createElement("a");
      a.href = "#" + h.id;
      // on retire la numérotation décorative du titre
      var label = h.cloneNode(true);
      $$(".tc-n", label).forEach(function (n) { n.remove(); });
      a.textContent = label.textContent.trim();
      li.appendChild(a);
      ul.appendChild(li);
    });

    holder.innerHTML = "";
    holder.appendChild(ul);

    var links = $$("a", ul);
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });

    if ("IntersectionObserver" in window) {
      var seen = {};
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { seen[en.target.id] = en.isIntersecting; });
        var current = null;
        heads.forEach(function (h) { if (seen[h.id] && !current) current = h.id; });
        if (!current) return;
        links.forEach(function (a) { a.classList.remove("is-active"); });
        if (byId[current]) byId[current].classList.add("is-active");
      }, { rootMargin: "-80px 0px -70% 0px", threshold: 0 });
      heads.forEach(function (h) { io.observe(h); });
    }
  }

  /* ----------------------------------------------------------------- QCM */

  function initQuiz() {
    $$("[data-tc-quiz]").forEach(function (quiz) {
      var qs = $$("[data-tc-q]", quiz);
      var scoreEl = $("[data-tc-score]", quiz);
      var answered = 0, good = 0;

      var refresh = function () {
        if (!scoreEl) return;
        scoreEl.textContent = good + " / " + qs.length;
        if (answered === qs.length) {
          scoreEl.style.borderColor = good === qs.length ? "var(--tc-good)" : "var(--tc-accent-pure)";
          scoreEl.style.color = good === qs.length ? "var(--tc-good)" : "var(--tc-accent)";
        }
      };
      refresh();

      qs.forEach(function (q) {
        var opts = $$(".tc-opt", q);
        opts.forEach(function (opt, i) {
          if (!opt.hasAttribute("data-k")) opt.setAttribute("data-k", "ABCDEF".charAt(i));
          opt.addEventListener("click", function () {
            if (q.dataset.tcDone === "1") return;
            q.dataset.tcDone = "1";
            answered++;
            var ok = opt.hasAttribute("data-correct");
            if (ok) good++;
            opts.forEach(function (o) {
              o.disabled = true;
              if (o.hasAttribute("data-correct")) o.classList.add("is-good");
            });
            if (!ok) opt.classList.add("is-bad");
            var exp = $("[data-tc-exp]", q);
            if (exp) exp.hidden = false;
            refresh();
          });
        });
      });
    });
  }

  /* ------------------------------------------------ corrections à révéler */

  function initReveal() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tc-reveal]");
      if (!btn) return;
      var sel = btn.getAttribute("data-tc-reveal");
      var target = sel ? $(sel) : btn.parentElement.nextElementSibling;
      if (!target) return;
      var show = target.hidden;
      target.hidden = !show;
      btn.textContent = show ? "Masquer la correction" : "Afficher la correction";
    });
  }

  /* --------------------------------------- vérification de réponse courte */

  function norm(s) {
    return String(s).trim().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ").replace(/,/g, ".");
  }

  function initCheck() {
    $$("[data-tc-check]").forEach(function (btn) {
      var input = $(btn.getAttribute("data-tc-check"));
      if (!input) return;
      var out = input.closest(".tc-field").querySelector("[data-tc-verdict]");
      var run = function () {
        var expected = (input.getAttribute("data-answer") || "").split("|").map(norm);
        var ok = expected.indexOf(norm(input.value)) !== -1;
        if (!out) return;
        out.hidden = false;
        out.className = "tc-verdict " + (ok ? "ok" : "ko");
        out.textContent = ok ? "Correct" : "Pas encore — réessaie";
      };
      btn.addEventListener("click", run);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") run(); });
    });
  }

  /* ------------------------------------------------------------- onglets */

  function initTabs() {
    $$("[data-tc-tabs]").forEach(function (box) {
      var tabs = $$(".tc-tab", box);
      var panels = $$("[data-tc-panel]", box);
      tabs.forEach(function (tab, i) {
        tab.setAttribute("role", "tab");
        tab.addEventListener("click", function () {
          tabs.forEach(function (t) { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
          panels.forEach(function (p, j) { p.hidden = j !== i; });
          tab.classList.add("is-active");
          tab.setAttribute("aria-selected", "true");
        });
      });
      if (tabs.length && !box.querySelector(".tc-tab.is-active")) tabs[0].click();
    });
  }

  /* ------------------------------------------------------ copier du code */

  function initCopy() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tc-copy]");
      if (!btn) return;
      var block = btn.closest(".tc-code");
      var code = block && block.querySelector("code");
      if (!code) return;
      var done = function () {
        var old = btn.textContent;
        btn.textContent = "Copié";
        setTimeout(function () { btn.textContent = old; }, 1400);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code.innerText).then(done, function () { select(code); });
      } else { select(code); }
    });
    function select(node) {
      var r = document.createRange();
      r.selectNodeContents(node);
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
  }

  /* ---------------------------------------------------- recherche / filtre */

  function initFilter() {
    $$("[data-tc-filter]").forEach(function (input) {
      var items = $$(input.getAttribute("data-tc-filter"));
      var empty = $("[data-tc-empty]");
      input.addEventListener("input", function () {
        var q = norm(input.value);
        var n = 0;
        items.forEach(function (el) {
          var hit = !q || norm(el.textContent).indexOf(q) !== -1;
          el.hidden = !hit;
          if (hit) n++;
        });
        if (empty) empty.hidden = n !== 0;
      });
    });
  }

  /* ------------------------------------- « cours terminé » + avancement */

  function initDone() {
    var done = store.get("done", {});

    $$("[data-tc-done]").forEach(function (btn) {
      var id = btn.getAttribute("data-tc-done");
      var paint = function () {
        var on = !!done[id];
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.classList.toggle("tc-btn--ghost", !on);
        btn.textContent = on ? "✓ Cours terminé" : "Marquer comme terminé";
      };
      btn.addEventListener("click", function () {
        done[id] = !done[id];
        store.set("done", done);
        paint();
        paintProgress(done);
      });
      paint();
    });

    paintProgress(done);
  }

  function paintProgress(done) {
    $$("[data-tc-progress]").forEach(function (el) {
      var ids = (el.getAttribute("data-tc-progress") || "").split(",")
        .map(function (s) { return s.trim(); }).filter(Boolean);
      if (!ids.length) return;
      var n = ids.filter(function (id) { return done[id]; }).length;
      var pct = Math.round((n / ids.length) * 100);
      var fill = $(".tc-bar__fill", el);
      if (fill) {
        fill.style.width = pct + "%";
        fill.classList.toggle("tc-bar__fill--done", pct === 100);
      }
      var label = $("[data-tc-progress-label]", el);
      if (label) label.textContent = n + "/" + ids.length + " terminé" + (n > 1 ? "s" : "");
    });

    $$("[data-tc-status]").forEach(function (el) {
      var id = el.getAttribute("data-tc-status");
      el.classList.toggle("tc-dot--done", !!done[id]);
    });
  }

  /* ---------------------- liens internes : sortir de l'iframe Google Sites */
  /* Dans un « full page embed », une page s'ouvre dans l'iframe sans la
     navigation du site. On force les liens internes sur la fenêtre parente. */

  function initFrameLinks() {
    if (window.self === window.top) return;
    $$("a[href]").forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#" || a.hasAttribute("target")) return;
      a.setAttribute("target", "_top");
    });
  }

  /* ----------------------------------------------------------- démarrage */

  function boot() {
    initTheme();
    initReadbar();
    initToc();
    initQuiz();
    initReveal();
    initCheck();
    initTabs();
    initCopy();
    initFilter();
    initDone();
    initFrameLinks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();
