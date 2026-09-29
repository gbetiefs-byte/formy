"use strict";

const state = { user: null, ready: false };

async function api(path, options = {}, _retry = true) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const res = await fetch(`/api${path}`, { ...options, headers, credentials: "include" });

  if (res.status === 401 && _retry && path !== "/auth/refresh") {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    if (refreshed.ok) return api(path, options, false);
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
  return data;
}

// ---------- Lexique (sigles administratifs expliqués en clair) ----------

let glossaryTerms = [];
let glossaryPattern = null;

async function loadGlossary() {
  try {
    glossaryTerms = await api("/glossaire");
    if (glossaryTerms.length > 0) {
      const escaped = glossaryTerms.map((g) => g.terme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      glossaryPattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "g");
    }
  } catch (_) {
    glossaryTerms = [];
  }
}

// Découpe un texte en segments texte/<abbr> pour expliquer chaque sigle
// reconnu au survol (ou au focus clavier), sans jamais modifier le sens du
// texte source. Retourne un tableau utilisable comme enfants de el().
function jargonize(text) {
  if (!text || !glossaryPattern) return [text];
  glossaryPattern.lastIndex = 0;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = glossaryPattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const entry = glossaryTerms.find((g) => g.terme === match[0]);
    parts.push(el("abbr", { class: "jargon", title: entry.definition, tabindex: "0" }, match[0]));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === "onclick" || key === "onsubmit" || key === "onchange" || key === "oninput") {
      node.addEventListener(key.slice(2), value);
    } else if (key === "html") {
      node.innerHTML = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

const STATUT_LABELS = { a_faire: "À faire", en_cours: "En cours", termine: "Terminé" };

// Convertit une date d'échéance en repère relatif clair ("demain", "dans 5
// jours", "en retard de 2 jours") : afficher uniquement "29/09/2026" oblige
// chacun à calculer soi-même l'écart avec aujourd'hui, ce qui prête à
// confusion. On compare des dates tronquées à minuit (sans heure) pour que
// l'écart en jours soit toujours un nombre entier, sans effet de bord lié
// au fuseau horaire ou à l'heure de la journée.
function relativeEcheance(dateStr) {
  const echeance = new Date(dateStr);
  const today = new Date();
  const echeanceMidnight = new Date(echeance.getFullYear(), echeance.getMonth(), echeance.getDate());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((echeanceMidnight - todayMidnight) / (24 * 60 * 60 * 1000));

  if (diffDays < 0) return { label: `en retard de ${-diffDays} jour${-diffDays > 1 ? "s" : ""}`, urgency: "overdue" };
  if (diffDays === 0) return { label: "aujourd'hui", urgency: "today" };
  if (diffDays === 1) return { label: "demain", urgency: "soon" };
  if (diffDays <= 7) return { label: `dans ${diffDays} jours`, urgency: "soon" };
  return { label: `dans ${diffDays} jours`, urgency: "later" };
}

function formatEcheance(dateStr) {
  const date = new Date(dateStr).toLocaleDateString("fr-FR");
  const { label, urgency } = relativeEcheance(dateStr);
  return { text: `${date} (${label})`, urgency };
}

function LoadingView() {
  return el("div", { id: "main", class: "loading", "aria-busy": "true" }, [
    el("div", { class: "spinner" }),
    el("p", { class: "notice" }, "Chargement..."),
  ]);
}

// ---------- Navigation (URLs réelles, sans #) ----------

function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  router();
}

document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-link]");
  if (link) {
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin) {
      e.preventDefault();
      closeMobileNav();
      navigate(url.pathname);
      return;
    }
  }
  if (e.target.closest("#nav-toggle")) {
    toggleMobileNav();
  }
});

window.addEventListener("popstate", router);

function toggleMobileNav() {
  const nav = document.getElementById("nav");
  const toggle = document.getElementById("nav-toggle");
  const isOpen = nav.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(isOpen));
}

function closeMobileNav() {
  document.getElementById("nav")?.classList.remove("open");
  document.getElementById("nav-toggle")?.setAttribute("aria-expanded", "false");
}

// ---------- Thème clair/sombre (préférence mémorisée par appareil) ----------

function applyTheme(theme) {
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
}

function initTheme() {
  const saved = localStorage.getItem("formy_theme");
  if (saved) applyTheme(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const isDarkNow = current ? current === "dark" : prefersDark;
  const next = isDarkNow ? "light" : "dark";
  localStorage.setItem("formy_theme", next);
  applyTheme(next);
}

function requireAuthOrRedirect() {
  if (!state.user) {
    navigate("/login");
    return false;
  }
  return true;
}

async function refreshCurrentUser() {
  try {
    // api() renouvelle la session via le refresh token si l'access token
    // (15 min) a expiré : indispensable maintenant que l'accès à toute
    // l'application dépend de cet état. Un visiteur anonyme finit en erreur.
    state.user = await api("/auth/me");
  } catch (_) {
    state.user = null;
  }
  state.ready = true;
}

function renderNav() {
  const nav = document.getElementById("nav");
  nav.className = "nav"; // réinitialise l'état "open" éventuel du menu mobile
  nav.innerHTML = "";
  const path = location.pathname;
  const link = (href, label) => el("a", { href, "data-link": "", "aria-current": path === href ? "page" : null }, label);

  // Tant que le profil n'est pas complété, les rubriques de l'application
  // restent masquées : parcours inscription -> profil -> application.
  if (state.user && state.user.profile_complete) {
    nav.appendChild(link("/catalogue", "Catalogue"));
    nav.appendChild(link("/evenements", "Événements de vie"));
    nav.appendChild(link("/mes-demarches", "Mes démarches"));
  }

  if (state.user) {
    if (state.user.profile_complete) nav.appendChild(link("/profil", `Profil (${state.user.prenom || state.user.email})`));
    if (state.user.role === "admin") nav.appendChild(link("/admin", "Admin"));
    nav.appendChild(
      el("button", {
        onclick: async () => {
          await api("/auth/logout", { method: "POST" });
          state.user = null;
          navigate("/");
        },
      }, "Déconnexion")
    );
  } else {
    nav.appendChild(link("/login", "Connexion"));
    nav.appendChild(el("a", { class: "primary", href: "/register", "data-link": "" }, "Créer un compte"));
  }

  nav.appendChild(
    el("button", {
      class: "theme-toggle",
      "aria-label": "Changer le thème d'affichage",
      onclick: toggleTheme,
    }, "Thème")
  );
}

const app = document.getElementById("app");
function render(node) {
  app.innerHTML = "";
  app.appendChild(node);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ---------- Vues ----------

function LoginView() {
  const errorBox = el("p", { class: "error", role: "alert" });
  const form = el("form", {
    onsubmit: async (e) => {
      e.preventDefault();
      errorBox.textContent = "";
      try {
        const email = form.email.value.trim();
        const password = form.password.value;
        await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        await refreshCurrentUser();
        navigate("/mes-demarches");
      } catch (err) {
        errorBox.textContent = err.message;
      }
    },
  }, [
    el("label", { for: "login-email" }, "Email"),
    el("input", { id: "login-email", name: "email", type: "email", required: "true" }),
    el("label", { for: "login-password" }, "Mot de passe"),
    el("input", { id: "login-password", name: "password", type: "password", required: "true" }),
    el("button", { class: "btn", type: "submit" }, "Se connecter"),
  ]);

  const fcButton = el("div", { id: "fc-zone" });
  api("/auth/franceconnect/status")
    .then((s) => {
      if (s.enabled) {
        fcButton.appendChild(
          el("a", { class: "btn fc-btn", href: "/api/auth/franceconnect/login" }, "S'identifier avec FranceConnect")
        );
      }
    })
    .catch(() => {});

  return el("div", { id: "main" }, [
    el("h1", {}, "Connexion"),
    fcButton,
    form,
    errorBox,
    el("p", { class: "notice" }, ["Pas encore de compte ? ", el("a", { href: "/register", "data-link": "" }, "Créez-en un gratuitement.")]),
  ]);
}

function RegisterView() {
  const errorBox = el("p", { class: "error", role: "alert" });
  const form = el("form", {
    onsubmit: async (e) => {
      e.preventDefault();
      errorBox.textContent = "";
      if (!form.consent.checked) {
        errorBox.textContent = "Vous devez accepter la politique de confidentialité.";
        return;
      }
      try {
        const payload = {
          prenom: form.prenom.value.trim(),
          email: form.email.value.trim(),
          password: form.password.value,
          consent: form.consent.checked,
        };
        await api("/auth/register", { method: "POST", body: JSON.stringify(payload) });
        await refreshCurrentUser();
        navigate("/profil");
      } catch (err) {
        errorBox.textContent = err.message;
      }
    },
  }, [
    el("label", { for: "reg-prenom" }, "Prénom"),
    el("input", { id: "reg-prenom", name: "prenom" }),
    el("label", { for: "reg-email" }, "Email"),
    el("input", { id: "reg-email", name: "email", type: "email", required: "true" }),
    el("label", { for: "reg-password" }, "Mot de passe"),
    el("input", { id: "reg-password", name: "password", type: "password", required: "true", minlength: "8" }),
    el("p", { class: "notice" }, "Au moins 8 caractères, avec une lettre et un chiffre."),
    el("label", { class: "checkbox-label" }, [
      el("input", { type: "checkbox", name: "consent", required: "true" }),
      " J'accepte la ",
      el("a", { href: "/confidentialite", "data-link": "", target: "_blank" }, "politique de confidentialité"),
      " de Formy.",
    ]),
    el("button", { class: "btn", type: "submit" }, "Créer mon compte"),
  ]);

  return el("div", { id: "main" }, [
    el("p", { class: "eyebrow" }, "ÉTAPE 1 SUR 2"),
    el("h1", {}, "Créer un compte"),
    el("p", { class: "subtitle" }, "100% gratuit, aucune donnée revendue."),
    form,
    errorBox,
  ]);
}

async function CatalogueView() {
  const [categories, events, demarches] = await Promise.all([api("/categories"), api("/life-events"), api("/demarches")]);
  const catNameBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.nom]));

  const grid = el("div", { class: "grid" });
  const resultCount = el("p", { class: "notice", role: "status" });

  function renderList(list) {
    grid.innerHTML = "";
    resultCount.textContent = list.length === demarches.length
      ? `${list.length} démarches disponibles, gratuitement.`
      : `${list.length} résultat${list.length > 1 ? "s" : ""}.`;
    if (list.length === 0) {
      grid.appendChild(el("p", { class: "notice" }, "Aucune démarche ne correspond à votre recherche. Essayez d'autres mots-clés ou réinitialisez les filtres."));
      return;
    }
    for (const d of list) {
      grid.appendChild(
        el("a", { class: "card", href: `/demarches/${d.slug}`, "data-link": "" }, [
          el("span", { class: "card-meta" }, catNameBySlug[d.category_slug] || "Démarche"),
          el("h3", {}, d.titre),
          el("p", {}, d.description || ""),
        ])
      );
    }
  }

  const searchInput = el("input", { type: "search", placeholder: "Rechercher une démarche...", "aria-label": "Rechercher une démarche" });
  const categorySelect = el("select", { "aria-label": "Filtrer par catégorie" }, [
    el("option", { value: "" }, "Toutes les catégories"),
    ...categories.map((c) => el("option", { value: c.slug }, c.nom)),
  ]);
  const eventSelect = el("select", { "aria-label": "Filtrer par événement de vie" }, [
    el("option", { value: "" }, "Tous les événements de vie"),
    ...events.map((e) => el("option", { value: e.slug }, e.nom)),
  ]);
  const resetBtn = el("button", { class: "btn secondary", type: "button" }, "Réinitialiser");

  async function applyFilters() {
    const params = new URLSearchParams();
    if (searchInput.value.trim()) params.set("search", searchInput.value.trim());
    if (categorySelect.value) params.set("category", categorySelect.value);
    if (eventSelect.value) params.set("event", eventSelect.value);
    const filtered = await api(`/demarches?${params.toString()}`);
    renderList(filtered);
  }

  searchInput.addEventListener("input", debounce(applyFilters, 250));
  categorySelect.addEventListener("change", applyFilters);
  eventSelect.addEventListener("change", applyFilters);
  resetBtn.addEventListener("click", () => {
    searchInput.value = "";
    categorySelect.value = "";
    eventSelect.value = "";
    renderList(demarches);
  });
  renderList(demarches);

  const recoSection = el("div", {});
  if (state.user) {
    api("/demarches/recommandees")
      .then((reco) => {
        if (reco.length === 0) return;
        recoSection.appendChild(el("h2", {}, "Recommandé pour vous"));
        recoSection.appendChild(
          el("div", { class: "grid" }, reco.map((d) =>
            el("a", { class: "card", href: `/demarches/${d.slug}`, "data-link": "" }, [
                el("span", { class: "card-meta" }, catNameBySlug[d.category_slug] || "Démarche"),
                el("h3", {}, d.titre),
              el("p", {}, d.description || ""),
            ])
          ))
        );
      })
      .catch(() => {});
  }

  return el("div", { id: "main" }, [
    el("h1", {}, "Catalogue des démarches"),
    resultCount,
    recoSection,
    el("div", { class: "toolbar" }, [searchInput, categorySelect, eventSelect, resetBtn]),
    grid,
  ]);
}

async function EvenementsView() {
  const events = await api("/life-events");
  const grid = el("div", { class: "life-events-grid" },
    events.map((evt) =>
      el("a", { class: "card", href: `/evenements/${evt.slug}`, "data-link": "" }, [
        el("h3", {}, evt.nom),
        el("p", {}, evt.description || ""),
      ])
    )
  );
  return el("div", { id: "main" }, [
    el("h1", {}, "Qu'est-ce qui vous arrive ?"),
    el("p", { class: "subtitle" }, "Formy regroupe automatiquement toutes les démarches liées à votre situation."),
    grid,
  ]);
}

async function EvenementDetailView(slug) {
  const [events, demarches] = await Promise.all([api("/life-events"), api(`/life-events/${slug}/demarches`)]);
  const event = events.find((e) => e.slug === slug);
  const grid = el("div", { class: "grid" },
    demarches.map((d) => el("a", { class: "card", href: `/demarches/${d.slug}`, "data-link": "" }, [
      el("h3", {}, d.titre),
      el("p", {}, d.description || ""),
    ]))
  );
  return el("div", { id: "main" }, [
    el("a", { class: "breadcrumb", href: "/evenements", "data-link": "" }, "← Tous les événements de vie"),
    el("h1", {}, event ? event.nom : "Événement de vie"),
    el("p", { class: "subtitle" }, event ? event.description : ""),
    el("h2", {}, `${demarches.length} démarche(s) à effectuer`),
    grid,
  ]);
}

async function DemarcheDetailView(slug) {
  const demarche = await api(`/demarches/${slug}`);

  let myProgress = null;
  if (state.user) {
    try {
      const all = await api("/progress");
      myProgress = all.find((p) => p.demarche_slug === slug) || null;
    } catch (_) {}
  }

  const container = el("div", { id: "main" });

  const startBtn = el("button", {
    class: "btn",
    onclick: async () => {
      if (!requireAuthOrRedirect()) return;
      myProgress = await api(`/progress/${slug}`, { method: "POST" });
      renderAll();
    },
  }, myProgress ? "Suivi en cours" : "Suivre cette démarche");

  const echeanceInput = el("input", {
    type: "date",
    value: myProgress?.date_echeance ? myProgress.date_echeance.slice(0, 10) : "",
    "aria-label": "Date d'échéance personnelle",
    onchange: async (e) => {
      if (!requireAuthOrRedirect()) return;
      if (!myProgress) myProgress = await api(`/progress/${slug}`, { method: "POST" });
      myProgress = await api(`/progress/${slug}`, { method: "PUT", body: JSON.stringify({ date_echeance: e.target.value || null }) });
    },
  });

  function buildStepsList() {
    return el("ul", { class: "steps" },
      demarche.etapes.map((etape) =>
        el("li", {}, [
          el("input", {
            type: "checkbox",
            id: `etape-${etape.id}`,
            checked: etape.done ? "checked" : null,
            onchange: async (e) => {
              if (!requireAuthOrRedirect()) { e.target.checked = false; return; }
              const result = await api(`/progress/${slug}/etapes/${etape.id}`, { method: "PUT", body: JSON.stringify({ done: e.target.checked }) });
              etape.done = e.target.checked;
              myProgress = { ...(myProgress || {}), statut: result.statut };
              renderAll();
            },
          }),
          el("label", { for: `etape-${etape.id}` }, [
            el("div", {}, jargonize(etape.titre)),
            etape.description ? el("div", { class: "step-desc" }, jargonize(etape.description)) : null,
          ]),
        ])
      )
    );
  }

  function renderAll() {
    const completed = demarche.etapes.filter((e) => e.done).length;
    const total = demarche.etapes.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    container.innerHTML = "";
    container.appendChild(el("div", {}, [
      el("a", { class: "breadcrumb no-print", href: "/catalogue", "data-link": "" }, "← Retour au catalogue"),
      myProgress ? el("span", { class: `badge statut-${myProgress.statut}` }, STATUT_LABELS[myProgress.statut]) : null,
      el("h1", {}, demarche.titre),
      el("p", { class: "subtitle" }, jargonize(demarche.description)),
      el("p", { class: "notice" }, `Catégorie : ${demarche.category_nom} — vérifié le ${new Date(demarche.verified_at).toLocaleDateString("fr-FR")}`),
      el("div", { class: "toolbar no-print" }, [
        startBtn,
        el("label", { for: "echeance-input", class: "inline-label" }, "Échéance perso. :"),
        Object.assign(echeanceInput, { id: "echeance-input" }),
        el("button", { class: "btn secondary", type: "button", onclick: () => window.print() }, "Imprimer"),
      ]),
      el("div", { class: "info-block" }, [el("h4", {}, "Délai"), el("p", {}, jargonize(demarche.delai || "Non précisé"))]),
      el("div", { class: "info-block" }, [el("h4", {}, "Durée estimée"), el("p", {}, demarche.duree_estimee || "Non précisée")]),
      el("div", { class: "info-block" }, [el("h4", {}, "Documents nécessaires"), el("ul", {}, (demarche.documents_requis || []).map((doc) => el("li", {}, jargonize(doc))))]),
      el("h2", {}, "Étapes à suivre"),
      total > 0
        ? el("div", { class: "toolbar", style: "align-items:center; gap:10px" }, [
            el("div", { class: "progress-bar", style: "flex:1", role: "progressbar", "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100" }, [
              el("div", { class: "progress-bar-fill", style: `width:${pct}%` }),
            ]),
            el("span", { class: "notice" }, `${completed}/${total}`),
          ])
        : null,
      buildStepsList(),
      el("div", { class: "info-block pieges" }, [el("h4", {}, "Pièges à éviter"), el("ul", {}, (demarche.pieges || []).map((p) => el("li", {}, jargonize(p))))]),
      demarche.lien_officiel ? el("p", {}, ["Site officiel : ", el("a", { href: demarche.lien_officiel, target: "_blank", rel: "noopener" }, demarche.lien_officiel)]) : null,
    ]));
  }

  renderAll();
  return container;
}

async function MesDemarchesView() {
  if (!requireAuthOrRedirect()) return el("div", { id: "main" });
  const [progress, categories] = await Promise.all([api("/progress"), api("/categories")]);
  const catNameBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.nom]));

  if (progress.length === 0) {
    return el("div", { id: "main" }, [
      el("h1", {}, "Mes démarches"),
      el("p", { class: "notice" }, "Vous ne suivez encore aucune démarche."),
      el("a", { class: "btn", href: "/catalogue", "data-link": "" }, "Parcourir le catalogue"),
    ]);
  }

  const counts = { a_faire: 0, en_cours: 0, termine: 0 };
  for (const p of progress) counts[p.statut]++;

  // On distingue explicitement le retard de l'imminence : sans ça, une
  // démarche dont l'échéance est dépassée depuis des semaines restait
  // mélangée (voire absente) de la liste "prochains jours", sans jamais
  // être signalée comme en retard.
  const echeancesActives = progress.filter((p) => p.date_echeance && p.statut !== "termine");
  const echeancesEnRetard = echeancesActives.filter((p) => relativeEcheance(p.date_echeance).urgency === "overdue");
  const echeancesProches = echeancesActives.filter((p) => {
    const u = relativeEcheance(p.date_echeance).urgency;
    return u === "today" || u === "soon";
  });

  const statsBar = el("div", { class: "stats-bar" }, [
    el("div", { class: "stat" }, [el("strong", {}, String(progress.length)), " suivies"]),
    el("div", { class: "stat stat-a_faire" }, [el("strong", {}, String(counts.a_faire)), " à faire"]),
    el("div", { class: "stat stat-en_cours" }, [el("strong", {}, String(counts.en_cours)), " en cours"]),
    el("div", { class: "stat stat-termine" }, [el("strong", {}, String(counts.termine)), " terminées"]),
  ]);

  function echeanceAlertBlock(title, items) {
    if (items.length === 0) return null;
    return el("div", { class: "info-block pieges" }, [
      el("h4", {}, title),
      el("ul", {}, items.map((p) =>
        el("li", {}, [
          el("a", { href: `/demarches/${p.demarche_slug}`, "data-link": "" }, p.demarche_titre),
          ` — ${formatEcheance(p.date_echeance).text}`,
        ])
      )),
    ]);
  }

  const alerteRetard = echeanceAlertBlock("Échéances dépassées", echeancesEnRetard);
  const alerteEcheances = echeanceAlertBlock("Échéances des 7 prochains jours", echeancesProches);

  const grid = el("div", { class: "grid" },
    progress.map((p) => {
      const pct = p.total_etapes > 0 ? Math.round((p.etapes_completees / p.total_etapes) * 100) : 0;
      const echeanceInfo = p.date_echeance ? formatEcheance(p.date_echeance) : null;
      return el("a", { class: "card", href: `/demarches/${p.demarche_slug}`, "data-link": "" }, [
        el("span", { class: `badge statut-${p.statut}` }, STATUT_LABELS[p.statut]),
        el("span", { class: "card-meta" }, catNameBySlug[p.category_slug] || "Démarche"),
        el("h3", {}, p.demarche_titre),
        el("div", { class: "progress-bar", role: "progressbar", "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100" }, [
          el("div", { class: "progress-bar-fill", style: `width:${pct}%` }),
        ]),
        el("p", { class: "step-desc" }, `${p.etapes_completees}/${p.total_etapes} étapes`),
        echeanceInfo
          ? el("p", { class: `step-desc echeance-${echeanceInfo.urgency}` }, `Échéance : ${echeanceInfo.text}`)
          : null,
      ]);
    })
  );

  return el("div", { id: "main" }, [el("h1", {}, "Mes démarches"), statsBar, alerteRetard, alerteEcheances, grid]);
}

async function ProfilView() {
  if (!requireAuthOrRedirect()) return el("div", { id: "main" });
  const user = await api("/auth/me");
  // Première connexion : le profil est une étape obligatoire (onboarding).
  const onboarding = !user.profile_complete;
  const requiredAttr = onboarding ? "true" : null;
  const emptyOption = () => el("option", { value: "" }, onboarding ? "Choisir..." : "Non précisé");

  const errorBox = el("p", { class: "error", role: "alert" });
  const notice = el("p", { class: "notice", role: "status" });

  const form = el("form", {
    onsubmit: async (e) => {
      e.preventDefault();
      errorBox.textContent = "";
      notice.textContent = "";
      try {
        const payload = {
          prenom: form.prenom.value.trim(),
          age: form.age.value ? Number(form.age.value) : null,
          situation_familiale: form.situation_familiale.value,
          revenus: form.revenus.value,
          zone_geographique: form.zone_geographique.value.trim(),
          statut: form.statut.value,
        };
        state.user = await api("/profile", { method: "PUT", body: JSON.stringify(payload) });
        if (onboarding && state.user.profile_complete) {
          navigate("/");
          return;
        }
        notice.textContent = "Profil mis à jour.";
      } catch (err) {
        errorBox.textContent = err.message;
      }
    },
  }, [
    el("label", { for: "p-prenom" }, "Prénom"),
    el("input", { id: "p-prenom", name: "prenom", value: user.prenom || "", required: requiredAttr }),
    el("label", { for: "p-age" }, "Âge"),
    el("input", { id: "p-age", name: "age", type: "number", min: "0", max: "120", value: user.age ?? "", required: requiredAttr }),
    el("label", { for: "p-situation" }, "Situation familiale"),
    el("select", { id: "p-situation", name: "situation_familiale", required: requiredAttr }, [
      emptyOption(),
      ...["celibataire", "en_couple", "marie", "pacse", "divorce", "veuf"].map((v) =>
        el("option", { value: v, selected: user.situation_familiale === v ? "true" : null }, v.replace("_", " "))
      ),
    ]),
    el("label", { for: "p-statut" }, "Statut"),
    el("select", { id: "p-statut", name: "statut", required: requiredAttr }, [
      emptyOption(),
      ...["salarie", "independant", "etudiant", "demandeur_emploi", "retraite"].map((v) =>
        el("option", { value: v, selected: user.statut === v ? "true" : null }, v.replace("_", " "))
      ),
    ]),
    el("label", { for: "p-zone" }, "Zone géographique"),
    el("input", { id: "p-zone", name: "zone_geographique", value: user.zone_geographique || "", placeholder: "Ville ou code postal", required: requiredAttr }),
    el("label", { for: "p-revenus" }, "Tranche de revenus"),
    el("select", { id: "p-revenus", name: "revenus", required: requiredAttr }, [
      emptyOption(),
      ...["modeste", "moyen", "confortable"].map((v) => el("option", { value: v, selected: user.revenus === v ? "true" : null }, v)),
    ]),
    el("button", { class: "btn", type: "submit" }, onboarding ? "Terminer et accéder à Formy" : "Enregistrer"),
  ]);

  const dangerZone = el("div", { class: "info-block account-data" }, [
    el("h4", {}, "Mes données personnelles"),
    el("p", { class: "step-desc" }, "Conformément au RGPD, vous pouvez à tout moment récupérer une copie de vos données ou supprimer définitivement votre compte."),
    el("div", { class: "toolbar" }, [
      el("button", {
        class: "btn secondary",
        onclick: async () => {
          const data = await api("/profile/export");
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "formy-export.json";
          a.click();
        },
      }, "Exporter mes données"),
      el("button", {
        class: "btn danger-outline",
        onclick: async () => {
          if (!confirm("Supprimer définitivement votre compte et toutes vos données ? Cette action est irréversible.")) return;
          await api("/profile", { method: "DELETE" });
          state.user = null;
          navigate("/");
        },
      }, "Supprimer mon compte"),
    ]),
  ]);

  if (onboarding) {
    return el("div", { id: "main" }, [
      el("p", { class: "eyebrow" }, "ÉTAPE 2 SUR 2"),
      el("h1", {}, "Personnalisez votre profil"),
      el("p", { class: "subtitle" }, "Dernière étape avant d'accéder à Formy : ces informations nous permettent de vous recommander les démarches adaptées à votre situation. Tous les champs sont obligatoires."),
      form,
      errorBox,
    ]);
  }

  return el("div", { id: "main" }, [
    el("h1", {}, "Mon profil"),
    el("p", { class: "subtitle" }, "Ces informations permettent de personnaliser les recommandations Formy."),
    form,
    notice,
    errorBox,
    dangerZone,
  ]);
}

async function AdminView() {
  if (!requireAuthOrRedirect() || state.user.role !== "admin") return el("p", { class: "error" }, "Accès refusé.");
  const stats = await api("/admin/stats");
  return el("div", { id: "main" }, [
    el("h1", {}, "Tableau de bord administrateur"),
    el("div", { class: "grid" }, [
      el("div", { class: "card" }, [el("h3", {}, "Utilisateurs"), el("p", {}, String(stats.totalUsers))]),
      el("div", { class: "card" }, [el("h3", {}, "Démarches au catalogue"), el("p", {}, String(stats.totalDemarches))]),
      el("div", { class: "card" }, [el("h3", {}, "Suivis démarrés"), el("p", {}, String(stats.totalProgressEntries))]),
    ]),
  ]);
}

function ConfidentialiteView() {
  return el("div", { id: "main" }, [
    el("h1", {}, "Politique de confidentialité"),
    el("p", {}, "Formy collecte uniquement les données nécessaires à la personnalisation des démarches (email, prénom, âge, situation familiale, statut, zone géographique) et au suivi de votre progression."),
    el("p", {}, "Ces données ne sont jamais vendues ni partagées avec des tiers à des fins commerciales. Vous pouvez à tout moment exporter ou supprimer vos données depuis votre page Profil."),
    el("p", {}, "Base légale : consentement, recueilli lors de la création de compte. Les mots de passe sont stockés sous forme hachée (bcrypt), jamais en clair."),
    el("p", {}, "Pour toute question, contactez le responsable du traitement à l'adresse indiquée dans les CGU."),
  ]);
}

function CguView() {
  return el("div", { id: "main" }, [
    el("h1", {}, "Conditions Générales d'Utilisation"),
    el("p", {}, "Formy est un service gratuit d'accompagnement dans les démarches administratives françaises. Les informations fournies (délais, documents, montants) sont indicatives et peuvent évoluer : vérifiez toujours auprès des sites officiels liés depuis chaque fiche."),
    el("p", {}, "Formy n'est pas un service officiel de l'administration française et n'engage pas sa responsabilité juridique quant aux décisions prises par les organismes concernés."),
    el("p", {}, "L'utilisation du service est soumise à l'acceptation de la politique de confidentialité."),
  ]);
}

// ---------- Routing ----------

function HomeView() {
  // Visiteur : accueil limité à l'inscription / connexion. Les ressources
  // (catalogue, événements de vie...) ne sont accessibles qu'après inscription
  // et personnalisation du profil.
  const actions = state.user
    ? [
        el("a", { class: "btn", href: "/catalogue", "data-link": "" }, "Explorer les démarches"),
        el("a", { class: "btn secondary", href: "/evenements", "data-link": "" }, "Partir de ma situation"),
      ]
    : [
        el("a", { class: "btn", href: "/register", "data-link": "" }, "Créer mon compte gratuitement"),
        el("a", { class: "btn secondary", href: "/login", "data-link": "" }, "J'ai déjà un compte"),
      ];
  return el("div", { id: "main" }, [
    el("section", { class: "home-hero" }, [
      el("p", { class: "eyebrow" }, "VOS DÉMARCHES, EN CLAIR"),
      el("h1", {}, "Les démarches administratives, étape par étape."),
      el("p", { class: "subtitle" }, "Documents à préparer, délais à respecter et étapes à suivre : retrouvez l’essentiel pour avancer sereinement."),
      el("div", { class: "toolbar" }, actions),
      el("p", { class: "home-proof" }, [el("strong", {}, "137 démarches"), " classées par thème et événement de vie"]),
    ]),
  ]);
}

let isFirstRouterCall = true;
const ASYNC_ROUTES = new Set(["catalogue", "evenements", "demarches", "mes-demarches", "profil", "admin"]);
// Pages déjà rendues côté serveur (SSR) : au tout premier chargement, on
// évite le flash d'un spinner par-dessus un contenu déjà correct.
const SSR_ROUTES = new Set(["catalogue", "evenements", "demarches"]);

async function router() {
  renderNav();
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean);
  const wasFirstCall = isFirstRouterCall;
  isFirstRouterCall = false;

  try {
    // Parcours imposé : inscription -> personnalisation du profil -> application.
    const first = segments[0];
    const PUBLIC_ROUTES = ["login", "register", "confidentialite", "cgu"];
    if (!state.user) {
      if (segments.length > 0 && !PUBLIC_ROUTES.includes(first)) {
        navigate("/register", { replace: true });
        return;
      }
    } else if (!state.user.profile_complete) {
      if (first !== "profil" && first !== "confidentialite" && first !== "cgu") {
        navigate("/profil", { replace: true });
        return;
      }
    } else if (first === "login" || first === "register") {
      navigate("/", { replace: true });
      return;
    }

    if (segments.length === 0) {
      // Le HTML de "/" est déjà rendu côté serveur (SSR) uniquement pour les
      // comptes au profil complet ; sinon la page est vide et on la rend ici.
      if (!wasFirstCall || !app.firstElementChild) render(HomeView());
      return;
    }
    if (segments[0] === "login") render(LoginView());
    else if (segments[0] === "register") render(RegisterView());
    else if (segments[0] === "confidentialite") render(ConfidentialiteView());
    else if (segments[0] === "cgu") render(CguView());
    else if (ASYNC_ROUTES.has(segments[0])) {
      // Un indicateur de chargement immédiat évite l'impression de clic mort
      // pendant l'aller-retour réseau (surtout notable sur connexion lente) —
      // sauf au tout premier chargement d'une page déjà rendue côté serveur.
      if (!(wasFirstCall && SSR_ROUTES.has(segments[0]))) render(LoadingView());
      if (segments[0] === "catalogue") render(await CatalogueView());
      else if (segments[0] === "evenements" && !segments[1]) render(await EvenementsView());
      else if (segments[0] === "evenements" && segments[1]) render(await EvenementDetailView(segments[1]));
      else if (segments[0] === "demarches" && segments[1]) render(await DemarcheDetailView(segments[1]));
      else if (segments[0] === "mes-demarches") render(await MesDemarchesView());
      else if (segments[0] === "profil") render(await ProfilView());
      else if (segments[0] === "admin") render(await AdminView());
    } else render(el("div", { id: "main" }, [el("h1", {}, "Page introuvable"), el("a", { class: "btn", href: "/", "data-link": "" }, "Retour à l'accueil")]));
  } catch (err) {
    render(el("p", { class: "error", role: "alert" }, err.message));
  }
}

// La fonctionnalité de cache hors-ligne a été retirée (elle servait des
// versions périmées de l'app pendant le développement actif — voir sw.js).
// On enregistre quand même /sw.js une dernière fois : c'est désormais un
// "kill switch" qui désinstalle proprement tout service worker restant
// actif chez les visiteurs qui avaient l'ancienne version. À supprimer une
// fois qu'on est raisonnablement certain que plus personne n'a l'ancien SW
// (par exemple après la mise en production).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

(async function init() {
  initTheme();
  await Promise.all([refreshCurrentUser(), loadGlossary()]);
  await router();
})();
