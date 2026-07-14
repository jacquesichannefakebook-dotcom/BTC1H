const state = {
  session: null,
  profile: null,
  appStarted: false,
  secureAnalysis: null,
  candles: [],
  liveTimer: null,
  market: null,
  marketPricing: null,
  lastAlertKey: null,
  quotaTimer: null,
  quotaLocked: false,
  studyObservations: [],
  studySummary: null,
  lastStudyFetch: 0
};

const remoteConfig = window.BTC1H_CONFIG || {};

const QUOTA_BASE_MS = 2 * 60 * 60 * 1000;
const QUOTA_REWARD_MS = 2 * 60 * 60 * 1000;
const QUOTA_STORAGE_KEY = "btc-signal-engine-quota";
const AUTH_SESSION_STORAGE_KEY = "btc1h-private-session";
const HOURLY_HYPOTHESIS_STORAGE_KEY = "btc-signal-engine-hourly-hypotheses";
const NEUTRAL_STRENGTH_THRESHOLD = 0.32;
const FIXED_MODEL_VERSION = "fixed-hour-v3.0.0";
const MIN_EXPECTED_VALUE = 0.02;

const els = {
  authGate: document.getElementById("authGate"),
  appShell: document.getElementById("appShell"),
  authTabs: document.getElementById("authTabs"),
  showLoginBtn: document.getElementById("showLoginBtn"),
  showSignupBtn: document.getElementById("showSignupBtn"),
  loginForm: document.getElementById("loginForm"),
  signupForm: document.getElementById("signupForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  signupEmail: document.getElementById("signupEmail"),
  signupPassword: document.getElementById("signupPassword"),
  signupPasswordConfirm: document.getElementById("signupPasswordConfirm"),
  pendingAccess: document.getElementById("pendingAccess"),
  blockedAccess: document.getElementById("blockedAccess"),
  pendingLogoutBtn: document.getElementById("pendingLogoutBtn"),
  blockedLogoutBtn: document.getElementById("blockedLogoutBtn"),
  authStatus: document.getElementById("authStatus"),
  accountIdentity: document.getElementById("accountIdentity"),
  logoutBtn: document.getElementById("logoutBtn"),
  accessManagementDetails: document.getElementById("accessManagementDetails"),
  adminAccessPanel: document.getElementById("adminAccessPanel"),
  refreshAccessUsersBtn: document.getElementById("refreshAccessUsersBtn"),
  accessUsersList: document.getElementById("accessUsersList"),
  shareBtn: document.getElementById("shareBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  rewardAdBtn: document.getElementById("rewardAdBtn"),
  overlayRewardAdBtn: document.getElementById("overlayRewardAdBtn"),
  quotaTimeValue: document.getElementById("quotaTimeValue"),
  quotaFill: document.getElementById("quotaFill"),
  quotaOverlay: document.getElementById("quotaOverlay"),
  horizonInput: document.getElementById("horizonInput"),
  sensitivityInput: document.getElementById("sensitivityInput"),
  marketUrlInput: document.getElementById("marketUrlInput"),
  loadMarketBtn: document.getElementById("loadMarketBtn"),
  liveToggle: document.getElementById("liveToggle"),
  indicatorChartsToggle: document.getElementById("indicatorChartsToggle"),
  decisionAlertsToggle: document.getElementById("decisionAlertsToggle"),
  statusLine: document.getElementById("statusLine"),
  shareStatus: document.getElementById("shareStatus"),
  signalCard: document.getElementById("signalCard"),
  directionValue: document.getElementById("directionValue"),
  directionText: document.getElementById("directionText"),
  directionContext: document.getElementById("directionContext"),
  plainSummary: document.getElementById("plainSummary"),
  spotValue: document.getElementById("spotValue"),
  forecastValue: document.getElementById("forecastValue"),
  forecastContext: document.getElementById("forecastContext"),
  fixedTargetValue: document.getElementById("fixedTargetValue"),
  fixedTargetContext: document.getElementById("fixedTargetContext"),
  deltaValue: document.getElementById("deltaValue"),
  deltaContext: document.getElementById("deltaContext"),
  liveHypothesisCard: document.getElementById("liveHypothesisCard"),
  liveHypothesisValue: document.getElementById("liveHypothesisValue"),
  liveHypothesisContext: document.getElementById("liveHypothesisContext"),
  fixedHypothesisCard: document.getElementById("fixedHypothesisCard"),
  fixedHypothesisValue: document.getElementById("fixedHypothesisValue"),
  fixedHypothesisContext: document.getElementById("fixedHypothesisContext"),
  hourlyCloseCard: document.getElementById("hourlyCloseCard"),
  hourlyCloseValue: document.getElementById("hourlyCloseValue"),
  hourlyCloseContext: document.getElementById("hourlyCloseContext"),
  hourlyCloseFactors: document.getElementById("hourlyCloseFactors"),
  chartBadge: document.getElementById("chartBadge"),
  priceChart: document.getElementById("priceChart"),
  signalList: document.getElementById("signalList"),
  slotGrid: document.getElementById("slotGrid"),
  studyList: document.getElementById("studyList"),
  hourHistory: document.getElementById("hourHistory"),
  modelSupervision: document.getElementById("modelSupervision"),
  studyDatabase: document.getElementById("studyDatabase"),
  databaseStatus: document.getElementById("databaseStatus"),
  marketQuestion: document.getElementById("marketQuestion"),
  logBox: document.getElementById("logBox")
};

const fmtUsd = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const fmtDelta = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
  signDisplay: "always"
});

const fmtPct = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 2,
  signDisplay: "always"
});

const fmtAbsPct = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 2
});

const fmtTime = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit"
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function std(values) {
  const m = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
}

function getSettings() {
  return {
    horizon: Number(els.horizonInput.value),
    sensitivity: Number(els.sensitivityInput.value),
    showIndicatorCharts: els.indicatorChartsToggle.checked
  };
}

function authConfig() {
  return {
    url: String(remoteConfig.supabaseUrl || "").replace(/\/$/, ""),
    key: String(remoteConfig.supabaseAnonKey || "")
  };
}

function setAuthStatus(message, mode = "") {
  els.authStatus.textContent = message;
  els.authStatus.className = `auth-status${mode ? ` is-${mode}` : ""}`;
}

function friendlyAuthError(error, context = "login") {
  const message = String(error?.message || error || "").trim();
  const normalized = message.toLowerCase();
  if (normalized.includes("rate limit") || normalized.includes("too many requests") || normalized.includes("429")) {
    return "Trop de demandes ont ete envoyees en peu de temps. Attends quelques minutes avant de reessayer. Si la confirmation par e-mail est activee, la limite concerne l'envoi des e-mails Supabase, pas le nombre de comptes autorises.";
  }
  if (normalized.includes("already registered") || normalized.includes("already exists") || normalized.includes("user already")) {
    return "Un compte existe deja avec cette adresse e-mail. Utilise Connexion ou choisis une autre adresse.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Cette adresse e-mail n'est pas encore confirmee. Ouvre l'e-mail recu, puis reviens te connecter.";
  }
  if (normalized.includes("invalid login credentials")) {
    return "Adresse e-mail ou mot de passe incorrect.";
  }
  if (normalized.includes("password") && (normalized.includes("weak") || normalized.includes("least") || normalized.includes("characters"))) {
    return "Le mot de passe doit contenir au moins 8 caracteres et ne pas etre trop facile a deviner.";
  }
  if (normalized.includes("invalid") && normalized.includes("email")) {
    return "L'adresse e-mail n'est pas valide.";
  }
  if (normalized.includes("signup") && (normalized.includes("disabled") || normalized.includes("not allowed"))) {
    return "La creation de comptes est desactivee dans Supabase. Active les inscriptions par e-mail dans Authentication > Providers > Email.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("network")) {
    return "Connexion impossible avec le serveur. Verifie Internet puis reessaie.";
  }
  if (context === "signup") {
    return message ? `Creation du compte impossible : ${message}` : "Creation du compte impossible pour le moment.";
  }
  return message || "Connexion impossible pour le moment.";
}

function setAuthMode(mode) {
  const login = mode === "login";
  els.loginForm.hidden = !login;
  els.signupForm.hidden = login;
  els.authTabs.hidden = false;
  els.pendingAccess.hidden = true;
  els.blockedAccess.hidden = true;
  els.showLoginBtn.classList.toggle("is-active", login);
  els.showSignupBtn.classList.toggle("is-active", !login);
  setAuthStatus("");
}

function readAuthSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_SESSION_STORAGE_KEY));
    return parsed?.access_token && parsed?.refresh_token ? parsed : null;
  } catch {
    return null;
  }
}

function saveAuthSession(payload) {
  const session = payload?.session || payload;
  if (!session?.access_token || !session?.refresh_token) return null;
  const expiresAt = Number(session.expires_at)
    || Math.floor(Date.now() / 1000) + (Number(session.expires_in) || 3600);
  state.session = { ...session, expires_at: expiresAt };
  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(state.session));
  return state.session;
}

function clearAuthSession() {
  state.session = null;
  state.profile = null;
  state.secureAnalysis = null;
  localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

async function authRequest(path, body, accessToken = null) {
  const { url, key } = authConfig();
  if (!url || !key) throw new Error("Configuration Supabase absente.");
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: "POST",
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.error_description || data.message || data.error || `Authentification ${response.status}`);
  return data;
}

async function refreshAuthSession(session) {
  if (!session?.refresh_token) return null;
  const data = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
  return saveAuthSession(data);
}

async function getValidSession() {
  let session = state.session || readAuthSession();
  if (!session) return null;
  if ((Number(session.expires_at) || 0) <= Math.floor(Date.now() / 1000) + 90) {
    try {
      session = await refreshAuthSession(session);
    } catch {
      clearAuthSession();
      return null;
    }
  } else {
    state.session = session;
  }
  return session;
}

async function fetchOwnProfile(session) {
  const { url, key } = authConfig();
  const userId = session?.user?.id;
  if (!userId) {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${session.access_token}` }
    });
    const user = await response.json().catch(() => null);
    if (!response.ok || !user?.id) throw new Error("Session invalide.");
    session.user = user;
    saveAuthSession(session);
  }
  const response = await fetch(
    `${url}/rest/v1/app_users?select=user_id,email,status,role&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${session.access_token}` } }
  );
  if (!response.ok) throw new Error(`Verification d'acces impossible (${response.status}).`);
  return (await response.json())[0] || { user_id: session.user.id, email: session.user.email, status: "pending", role: "user" };
}

async function authorizeSession(session) {
  setAuthStatus("Verification de l'autorisation...");
  const profile = await fetchOwnProfile(session);
  state.profile = profile;
  if (profile.status === "approved") {
    els.authGate.hidden = true;
    els.appShell.hidden = false;
    els.accountIdentity.textContent = profile.email || session.user?.email || "Compte autorise";
    startAuthorizedApp();
    return;
  }
  els.appShell.hidden = true;
  els.authGate.hidden = false;
  els.authTabs.hidden = true;
  els.loginForm.hidden = true;
  els.signupForm.hidden = true;
  els.pendingAccess.hidden = profile.status !== "pending";
  els.blockedAccess.hidden = profile.status !== "blocked";
  setAuthStatus(profile.status === "blocked" ? "Ce compte a ete bloque." : "Demande en attente.", profile.status === "blocked" ? "error" : "");
}

async function bootstrapAuth() {
  const { url, key } = authConfig();
  if (!url || !key) {
    setAuthStatus("Renseigne d'abord Supabase dans config.js.", "error");
    return;
  }
  const session = await getValidSession();
  if (!session) {
    setAuthMode("login");
    return;
  }
  try {
    await authorizeSession(session);
  } catch (error) {
    clearAuthSession();
    setAuthMode("login");
    setAuthStatus(error.message, "error");
  }
}

async function signOut() {
  const session = state.session;
  if (session?.access_token) {
    await authRequest("logout", {}, session.access_token).catch(() => null);
  }
  if (state.liveTimer) clearInterval(state.liveTimer);
  if (state.quotaTimer) clearInterval(state.quotaTimer);
  state.liveTimer = null;
  state.quotaTimer = null;
  clearAuthSession();
  els.appShell.hidden = true;
  els.authGate.hidden = false;
  setAuthMode("login");
  setAuthStatus("Deconnecte.");
}

function bindAuthEvents() {
  els.showLoginBtn.addEventListener("click", () => setAuthMode("login"));
  els.showSignupBtn.addEventListener("click", () => setAuthMode("signup"));
  els.pendingLogoutBtn.addEventListener("click", signOut);
  els.blockedLogoutBtn.addEventListener("click", signOut);
  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    if (submitButton?.disabled) return;
    if (submitButton) submitButton.disabled = true;
    setAuthStatus("Connexion...");
    try {
      const data = await authRequest("token?grant_type=password", {
        email: els.loginEmail.value.trim(),
        password: els.loginPassword.value
      });
      const session = saveAuthSession(data);
      if (!session) throw new Error("Session non recue.");
      await authorizeSession(session);
    } catch (error) {
      setAuthStatus(friendlyAuthError(error, "login"), "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
  els.signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    if (submitButton?.disabled) return;
    if (els.signupPassword.value !== els.signupPasswordConfirm.value) {
      setAuthStatus("Les deux mots de passe sont differents.", "error");
      return;
    }
    if (submitButton) submitButton.disabled = true;
    setAuthStatus("Creation du compte...");
    try {
      const data = await authRequest("signup", {
        email: els.signupEmail.value.trim(),
        password: els.signupPassword.value
      });
      const session = saveAuthSession(data);
      if (session) {
        await authorizeSession(session);
      } else {
        setAuthMode("login");
        els.loginEmail.value = els.signupEmail.value.trim();
        setAuthStatus("Compte cree. Confirme l'e-mail recu, puis connecte-toi pour attendre l'autorisation.", "success");
      }
    } catch (error) {
      setAuthStatus(friendlyAuthError(error, "signup"), "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

function startAuthorizedApp() {
  configureAdminAccess();
  if (state.appStarted) {
    restartLiveTimer();
    fetchSecureAnalysis().catch(showError);
    return;
  }
  state.appStarted = true;
  bindEvents();
  startQuotaTimer();
  restartLiveTimer();
  refreshStudyDatabase(true).catch(() => null);
  fetchSecureAnalysis().catch(showError);
}

function configureAdminAccess() {
  const isAdmin = state.profile?.role === "admin" && state.profile?.status === "approved";
  els.accessManagementDetails.hidden = !isAdmin;
  els.adminAccessPanel.hidden = !isAdmin;
  if (isAdmin) loadAccessUsers().catch((error) => {
    els.accessUsersList.textContent = error.message;
  });
}

async function authorizedRest(path, init = {}) {
  const session = await getValidSession();
  const { url, key } = authConfig();
  if (!session) throw new Error("Session expiree.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Base ${response.status}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function loadAccessUsers() {
  if (state.profile?.role !== "admin") return;
  els.accessUsersList.textContent = "Chargement des comptes...";
  const rows = await authorizedRest("app_users?select=user_id,email,status,role,created_at,approved_at&order=created_at.desc");
  els.accessUsersList.innerHTML = "";
  asArray(rows).forEach((row) => {
    const article = document.createElement("article");
    article.className = "access-user-row";
    const identity = document.createElement("div");
    identity.className = "access-user-identity";
    const email = document.createElement("strong");
    email.textContent = row.email || "E-mail indisponible";
    const meta = document.createElement("small");
    meta.textContent = `${row.role} | inscription ${new Date(row.created_at).toLocaleDateString("fr-FR")}`;
    identity.append(email, meta);
    const status = document.createElement("span");
    status.className = "access-status";
    status.textContent = row.status;
    const actions = document.createElement("div");
    actions.className = "access-user-actions";
    if (row.user_id !== state.profile.user_id) {
      const approve = document.createElement("button");
      approve.type = "button";
      approve.textContent = "Approuver";
      approve.disabled = row.status === "approved";
      approve.addEventListener("click", () => updateAccessStatus(row.user_id, "approved").catch(showError));
      const block = document.createElement("button");
      block.type = "button";
      block.textContent = "Bloquer";
      block.disabled = row.status === "blocked";
      block.addEventListener("click", () => updateAccessStatus(row.user_id, "blocked").catch(showError));
      actions.append(approve, block);
    }
    article.append(identity, status, actions);
    els.accessUsersList.appendChild(article);
  });
}

async function updateAccessStatus(userId, status) {
  if (state.profile?.role !== "admin") throw new Error("Droits administrateur requis.");
  const now = new Date().toISOString();
  await authorizedRest(`app_users?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status,
      approved_at: status === "approved" ? now : null,
      approved_by: status === "approved" ? state.profile.user_id : null,
      updated_at: now
    })
  });
  await loadAccessUsers();
}

async function fetchSecureAnalysis() {
  if (state.quotaLocked) return;
  const session = await getValidSession();
  if (!session || state.profile?.status !== "approved") throw new Error("Compte autorise requis.");
  setStatus("Analyse securisee en cours...");
  const { url, key } = authConfig();
  const response = await fetch(`${url}/functions/v1/secure-analysis`, {
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 403) {
    await authorizeSession(session).catch(() => null);
    throw new Error(data.error || "Acces refuse.");
  }
  if (!response.ok || !data.ok) throw new Error(data.error || `Analyse securisee ${response.status}`);
  state.secureAnalysis = data;
  state.candles = asArray(data.candles).map((row) => ({
    time: Number(row.time),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume)
  }));
  setStatus(`BTC actualise: ${new Date().toLocaleTimeString("fr-FR")}`);
  if (state.market) {
    await refreshMarketPricing().catch((error) => {
      state.marketPricing = null;
      log(`Prix Polymarket indisponibles: ${error.message}`);
      analyze();
    });
  } else {
    analyze();
  }
  refreshStudyDatabase().catch(() => null);
}

async function loadMarketFromUrl() {
  const raw = els.marketUrlInput.value.trim();
  if (!raw) throw new Error("Colle une URL ou un slug Polymarket.");
  const slug = extractSlug(raw);
  setStatus("Lecture du creneau Polymarket...");
  const market = await fetchMarketOrEvent(slug);
  state.market = market;
  state.marketPricing = null;
  const minutes = inferMinutesLeft(market);
  if (minutes) {
    const nearest = [15, 30, 45, 60].reduce((best, value) => (
      Math.abs(value - minutes) < Math.abs(best - minutes) ? value : best
    ), 60);
    els.horizonInput.value = String(nearest);
  }
  const question = market.question || market.title || market.slug || "Creneau charge.";
  els.marketQuestion.textContent = question;
  log(`Creneau lu: ${question}`);
  await refreshMarketPricing();
}

async function fetchMarketOrEvent(slug) {
  const marketResponse = await fetch(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`);
  if (!marketResponse.ok) throw new Error(`Polymarket a repondu ${marketResponse.status}`);
  const markets = asArray(await marketResponse.json());
  if (markets.length) return markets[0];

  const eventResponse = await fetch(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`);
  if (!eventResponse.ok) throw new Error(`Polymarket Events a repondu ${eventResponse.status}`);
  const events = asArray(await eventResponse.json());
  const eventMarkets = events.flatMap((event) => event.markets || []);
  if (!eventMarkets.length) throw new Error("Aucun creneau trouve pour cette URL.");
  return pickBestMarket(eventMarkets);
}

function extractSlug(value) {
  try {
    const url = new URL(value);
    return url.pathname.split("/").filter(Boolean).at(-1) || value;
  } catch {
    return value.split("/").filter(Boolean).at(-1) || value;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function pickBestMarket(markets) {
  const open = markets.filter((market) => market.active !== false && market.closed !== true);
  const btc = open.filter((market) => {
    const text = `${market.question || ""} ${market.title || ""} ${market.slug || ""}`.toLowerCase();
    return text.includes("bitcoin") || text.includes("btc");
  });
  return btc[0] || open[0] || markets[0];
}

function inferMinutesLeft(market) {
  const end = market.endDate || market.end_date || market.gameStartTime || market.endDateIso;
  if (!end) return null;
  const endMs = Date.parse(end);
  if (!Number.isFinite(endMs)) return null;
  return clamp(Math.ceil((endMs - Date.now()) / 60000), 1, 60);
}

function parseArrayField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function outcomeDirection(label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (/^(up|higher|hausse|haut)$/.test(normalized)) return "+";
  if (/^(down|lower|baisse|bas)$/.test(normalized)) return "-";
  return null;
}

async function refreshMarketPricing() {
  if (!state.market) return;
  const outcomes = parseArrayField(state.market.outcomes);
  const tokenIds = parseArrayField(state.market.clobTokenIds || state.market.clob_token_ids);
  const pairs = outcomes.map((outcome, index) => ({
    outcome,
    tokenId: tokenIds[index],
    direction: outcomeDirection(outcome)
  })).filter((pair) => pair.tokenId && pair.direction);
  if (!pairs.some((pair) => pair.direction === "+") || !pairs.some((pair) => pair.direction === "-")) {
    throw new Error("Ce marche ne contient pas les issues Up et Down attendues.");
  }
  const books = await Promise.all(pairs.map(async (pair) => {
    const response = await fetch(`https://clob.polymarket.com/book?token_id=${encodeURIComponent(pair.tokenId)}`);
    if (!response.ok) throw new Error(`Carnet Polymarket ${response.status}`);
    return { ...pair, book: await response.json() };
  }));
  const pricing = {};
  books.forEach(({ direction, outcome, tokenId, book }) => {
    const asks = asArray(book.asks).map((row) => Number(row.price)).filter(Number.isFinite);
    const bids = asArray(book.bids).map((row) => Number(row.price)).filter(Number.isFinite);
    pricing[direction] = {
      outcome,
      tokenId,
      ask: asks.length ? Math.min(...asks) : null,
      bid: bids.length ? Math.max(...bids) : null
    };
  });
  state.marketPricing = pricing;
  const up = pricing["+"];
  const down = pricing["-"];
  const question = state.market.question || state.market.title || state.market.slug || "Marche charge";
  els.marketQuestion.textContent = `${question} | achat Up ${formatCents(up?.ask)} | achat Down ${formatCents(down?.ask)}`;
  analyze();
}

function formatCents(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)} c` : "--";
}

function analyze() {
  if (state.quotaLocked) return;
  if (state.candles.length < 240) return;
  const settings = getSettings();
  const closes = state.candles.map((candle) => candle.close);
  const spot = closes.at(-1);
  const returns = closes.slice(1).map((close, index) => Math.log(close / closes[index]));
  const model = buildModel(state.candles, closes, returns, settings);
  const projectedReturn = model.projectedReturn;
  const forecast = spot * Math.exp(projectedReturn);
  const delta = forecast - spot;
  const deltaPct = forecast / spot - 1;
  const strength = Math.abs(projectedReturn) / Math.max(model.noise * settings.sensitivity, 0.000001);
  const rawConfidence = clamp((strength / 2) * model.regime.confidenceMultiplier, 0.05, 0.99);
  const direction = strength < NEUTRAL_STRENGTH_THRESHOLD ? "~" : delta >= 0 ? "+" : "-";
  const backtest = buildHourlyBacktest();
  const confidence = calibrateConfidence(rawConfidence, backtest, direction);
  const hourlyClose = buildHourlyCloseModel(state.candles, model, spot, settings, backtest);
  const secureReference = buildSecureOpeningReference(state.candles, spot);
  const remoteReference = buildRemoteOpeningReference(state.candles, spot);
  const hourlyReference = secureReference || remoteReference;
  if (!hourlyReference) throw new Error("Repere horaire securise indisponible.");
  const slotForecasts = buildSlotForecasts(spot, model, settings);
  const profitDecision = buildProfitDecision(hourlyReference);
  const hourlyHypothesis = remoteReference && !secureReference
    ? {
        bucket: remoteReference.bucket,
        capturedAt: remoteReference.capturedAt,
        startPrice: remoteReference.open,
        forecastPrice: remoteReference.closePrice,
        forecastDelta: remoteReference.closePrice - remoteReference.open,
        direction: remoteReference.direction,
        confidence: remoteReference.confidence,
        model: `remote-${remoteReference.modelVersion}`
      }
    : updateHourlyHypothesis({ spot, confidence, direction, slotForecasts, hourlyClose: hourlyReference });

  renderMetrics({ spot, forecast, delta, deltaPct, confidence, direction, settings, model, hourlyHypothesis, hourlyReference, profitDecision });
  renderPlainSummary({ spot, forecast, delta, deltaPct, confidence, direction, settings, model, slotForecasts, hourlyClose: hourlyReference, profitDecision });
  renderHypotheses({ spot, forecast, delta, confidence, direction, slotForecasts, hourlyHypothesis, hourlyClose, hourlyReference });
  renderHourlyCloseModel(hourlyReference);
  renderSignals({ direction, confidence, settings, model });
  renderSlots({ spot, model, settings, slotForecasts });
  renderStudyNotes({ spot, forecast, delta, direction, confidence, settings, model, slotForecasts });
  renderHourlyHistory(buildHourlyHistory(state.candles, 10));
  renderSupervision({ backtest, rawConfidence, confidence, direction });
  renderChart({ forecast, spot });
  maybeNotifyDecision(profitDecision, hourlyReference);
}

function marketFeeRate() {
  if (!state.market) return 0;
  const enabled = state.market.feesEnabled ?? state.market.fees_enabled;
  if (enabled === false || enabled === "false") return 0;
  const scheduleValue = state.market.feeSchedule || state.market.fee_schedule;
  let schedule = scheduleValue;
  if (typeof scheduleValue === "string") {
    try {
      schedule = JSON.parse(scheduleValue);
    } catch {
      schedule = null;
    }
  }
  const configured = Number(schedule?.rate ?? schedule?.r);
  return Number.isFinite(configured) && configured >= 0 ? configured : enabled ? 0.07 : 0;
}

function displayDirection(direction, { probabilityUp, value, reference } = {}) {
  if (direction === "+" || direction === "-") return direction;
  if (Number.isFinite(Number(probabilityUp))) return Number(probabilityUp) >= 0.5 ? "+" : "-";
  if (Number.isFinite(Number(value)) && Number.isFinite(Number(reference))) return Number(value) >= Number(reference) ? "+" : "-";
  return "+";
}

function buildProfitDecision(hourlyReference) {
  if (!hourlyReference) {
    return { action: false, status: "waiting-model", label: "--", direction: "~" };
  }
  const probabilityUp = Number(hourlyReference.probabilityUp);
  if (!Number.isFinite(probabilityUp)) {
    const signalDirection = displayDirection(hourlyReference.direction, {
      value: hourlyReference.closePrice,
      reference: hourlyReference.open
    });
    return {
      action: false,
      status: "legacy-model",
      label: signalDirection,
      direction: signalDirection,
      signalDirection,
      signalProbability: Number(hourlyReference.confidence) || 0.5
    };
  }
  const modelDirection = hourlyReference.direction;
  const signalDirection = displayDirection(modelDirection, { probabilityUp });
  const signalProbability = signalDirection === "+" ? probabilityUp : 1 - probabilityUp;
  if (modelDirection === "~") {
    return {
      action: false,
      status: "neutral",
      label: signalDirection,
      direction: signalDirection,
      signalDirection,
      signalProbability,
      probabilityUp
    };
  }
  if (!state.marketPricing) {
    return { action: false, status: "missing-market", label: signalDirection, direction: signalDirection, signalDirection, signalProbability, probabilityUp };
  }
  const quote = state.marketPricing[signalDirection];
  if (!quote || !Number.isFinite(quote.ask)) {
    return { action: false, status: "missing-price", label: signalDirection, direction: signalDirection, signalDirection, signalProbability, probabilityUp };
  }
  const feeRate = marketFeeRate();
  const fee = feeRate * quote.ask * (1 - quote.ask);
  const totalCost = quote.ask + fee;
  const expectedValue = signalProbability - totalCost;
  const action = expectedValue >= MIN_EXPECTED_VALUE;
  return {
    action,
    status: action ? "action" : "no-value",
    label: signalDirection,
    direction: signalDirection,
    signalDirection,
    signalProbability,
    probabilityUp,
    outcome: quote.outcome,
    ask: quote.ask,
    bid: quote.bid,
    fee,
    totalCost,
    expectedValue,
    expectedRoi: expectedValue / Math.max(totalCost, 0.000001)
  };
}

function maybeNotifyDecision(decision, hourlyReference) {
  if (!decision?.action || !els.decisionAlertsToggle?.checked || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  const key = `${hourlyReference.bucket}-${decision.label}`;
  if (state.lastAlertKey === key) return;
  state.lastAlertKey = key;
  new Notification(`BTC1H : occasion ${decision.label}`, {
    body: `Modele ${Math.round(decision.signalProbability * 100)}% | achat ${formatCents(decision.ask)} | avantage net ${formatSignedCents(decision.expectedValue)}.`
  });
}

function formatSignedCents(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} c`;
}

function buildModel(candles, closes, returns, settings, includeSeries = true) {
  const spot = closes.at(-1);
  const volumes = candles.map((candle) => candle.volume);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const last15 = returns.slice(-15);
  const last60 = returns.slice(-60);
  const last240 = returns.slice(-240);
  const volShort = Math.max(std(last60), 0.000001);
  const volLong = Math.max(std(last240), 0.000001);
  const vol1m = Math.max(volLong, volShort * 0.75, 0.000001);
  const noise = vol1m * Math.sqrt(settings.horizon);
  const momentum15 = Math.exp(sum(last15)) - 1;
  const momentum60 = Math.exp(sum(last60)) - 1;
  const momentum240 = Math.exp(sum(last240)) - 1;
  const ema12Series = ema(closes, 12);
  const ema26Series = ema(closes, 26);
  const ema50Series = ema(closes, 50);
  const ema200Series = ema(closes, 200);
  const ema12 = ema12Series.at(-1);
  const ema26 = ema26Series.at(-1);
  const ema50 = ema50Series.at(-1);
  const ema200 = ema200Series.at(-1);
  const macdLine = ema12 - ema26;
  const macdSeries = ema12Series.map((value, index) => value - ema26Series[index]);
  const macdSignal = ema(macdSeries.slice(26), 9).at(-1) || 0;
  const rsiValue = rsi(closes.slice(-80));
  const bb = bollinger(closes.slice(-80), 20, 2);
  const volumeRatio = mean(volumes.slice(-20)) / Math.max(mean(volumes.slice(-240)), 0.000001);
  const signedVolume = Math.sign(sum(last15)) * Math.log(Math.max(volumeRatio, 0.2));
  const volatilityRatio = volShort / volLong;
  const recentHigh = Math.max(...highs.slice(-120));
  const recentLow = Math.min(...lows.slice(-120));
  const rangePosition = (spot - recentLow) / Math.max(recentHigh - recentLow, 0.000001);
  const atrValue = atr(candles.slice(-80), 14);
  const regime = classifyRegime(volatilityRatio, Math.abs(ema50 / ema200 - 1), Math.abs(momentum60));

  const scores = {
    momentum15: clamp(momentum15 / Math.max(vol1m * Math.sqrt(15), 0.000001), -2, 2) / 2,
    momentum60: clamp(momentum60 / Math.max(vol1m * Math.sqrt(60), 0.000001), -2, 2) / 2,
    trend: clamp(((ema50 / ema200 - 1) / Math.max(vol1m * Math.sqrt(200), 0.000001)) + ((spot / ema50 - 1) / Math.max(vol1m * Math.sqrt(50), 0.000001)) * 0.35, -2, 2) / 2,
    macd: clamp(((macdLine - macdSignal) / Math.max(spot * vol1m * 12, 0.000001)), -1, 1),
    rsi: clamp((rsiValue - 50) / 35, -1, 1),
    bands: clamp((bb.position - 0.5) * 2, -1, 1),
    volume: clamp(signedVolume, -1, 1),
    longer: clamp(momentum240 / Math.max(vol1m * Math.sqrt(240), 0.000001), -1, 1)
  };
  scores.momentum = scores.momentum15 * 0.45 + scores.momentum60 * 0.55;

  const composite =
    scores.momentum * 0.25 +
    scores.trend * 0.22 +
    scores.macd * 0.16 +
    scores.rsi * 0.11 +
    scores.bands * 0.09 +
    scores.volume * 0.07 +
    scores.longer * 0.10;
  const baseDrift = (sum(last15) / 15) * 0.25 + (sum(last60) / 60) * 0.35 + (sum(last240) / 240) * 0.20 + ((ema12 / ema26 - 1) / 12) * 0.20;
  const modelReturn = baseDrift * settings.horizon + composite * noise * 0.75;
  const projectedReturn = clamp(modelReturn, -noise * 1.45, noise * 1.45);

  return {
    projectedReturn,
    noise,
    vol1m,
    momentum15,
    momentum60,
    momentum240,
    rsiValue,
    volumeRatio,
    volatilityRatio,
    ema12,
    ema26,
    ema50,
    ema200,
    macdLine,
    macdSignal,
    bb,
    recentHigh,
    recentLow,
    rangePosition,
    atrValue,
    scores,
    composite,
    regime,
    series: includeSeries ? buildIndicatorSeries(candles, closes, returns) : null
  };
}

function buildHourlyBacktest() {
  const backtest = state.secureAnalysis?.backtest;
  if (!backtest) {
    return { rows: [], attempted: 0, wins: 0, neutral: 0, accuracy: null, averageError: null };
  }
  return {
    rows: asArray(backtest.rows).map((row) => ({
      ...row,
      bucket: Number(row.bucket),
      confidence: Number(row.confidence),
      errorPct: Number(row.errorPct)
    })),
    attempted: Number(backtest.attempted) || 0,
    wins: Number(backtest.wins) || 0,
    neutral: Number(backtest.neutral) || 0,
    accuracy: backtest.accuracy === null ? null : Number(backtest.accuracy),
    averageError: backtest.averageError === null ? null : Number(backtest.averageError)
  };
}

function calibrateConfidence(confidence, backtest, direction) {
  if (direction === "~") return Math.min(confidence, 0.32);
  if (!backtest || backtest.attempted < 4 || backtest.accuracy === null) {
    return clamp(confidence * 0.9, 0.05, 0.99);
  }
  const sampleFactor = clamp(backtest.attempted / 8, 0.65, 1);
  const accuracyFactor = 0.82 + (backtest.accuracy - 0.5) * 0.75 * sampleFactor;
  return clamp(confidence * clamp(accuracyFactor, 0.58, 1.16), 0.05, 0.99);
}

function buildHourlyCloseModel(candles, model, spot, settings, backtest) {
  const bucket = hourStart(candles.at(-1).time);
  const currentHour = candles.filter((candle) => candle.time >= bucket);
  const open = currentHour[0]?.open || spot;
  const high = Math.max(...currentHour.map((candle) => candle.high), spot);
  const low = Math.min(...currentHour.map((candle) => candle.low), spot);
  const elapsed = clamp(currentHour.length, 1, 60);
  const remaining = Math.max(0, 60 - elapsed);
  const hourNoise = Math.max(model.vol1m * Math.sqrt(60), 0.000001);
  const distanceFromOpen = spot / open - 1;
  const hourRange = high - low;
  const rangePosition = hourRange < 0.000001 ? 0.5 : (spot - low) / hourRange;
  const completed = buildHourlyHistory(candles, 10);
  const recentBias = completed.length
    ? mean(completed.slice(0, 8).map((hour) => (hour.direction === "+" ? 1 : -1) * clamp(Math.abs(hour.deltaPct) / Math.max(hourNoise, 0.000001), 0, 1)))
    : 0;
  const recentContinuation = completed.length
    ? mean(completed.slice(0, 6).map((hour) => Math.sign(hour.deltaPct) * clamp(hour.rangePct / Math.max(hourNoise * 2, 0.000001), 0, 1)))
    : 0;
  const distanceScore = clamp(distanceFromOpen / Math.max(hourNoise * 0.7, 0.000001), -1, 1);
  const rangeScore = clamp((rangePosition - 0.5) * 2, -1, 1);
  const timePressure = clamp((elapsed - 12) / 48, 0, 1);
  const lateLock = distanceScore * timePressure;
  const livePressure = clamp(model.composite, -1, 1);
  const volatilityPenalty = model.regime.label === "volatil" ? 0.82 : model.regime.label === "calme" ? 0.92 : 1;

  const score =
    livePressure * 0.25 +
    distanceScore * 0.28 +
    rangeScore * 0.14 +
    recentBias * 0.13 +
    recentContinuation * 0.08 +
    lateLock * 0.12;
  const directionalScore = score;
  const remainingScale = Math.sqrt(Math.max(remaining, 1) / 60);
  const closeReturnFromNow = clamp(directionalScore * hourNoise * remainingScale * 0.85, -hourNoise * 1.35, hourNoise * 1.35);
  const closePrice = spot * Math.exp(closeReturnFromNow);
  const edgeFromOpen = closePrice / open - 1;
  const strength = Math.abs(edgeFromOpen) / Math.max(hourNoise * settings.sensitivity, 0.000001);
  const direction = strength < NEUTRAL_STRENGTH_THRESHOLD ? "~" : closePrice >= open ? "+" : "-";
  const probabilityMargin = clamp(strength * 0.45 * volatilityPenalty, 0, 0.22);
  const rawProbabilityUp = clamp(0.5 + Math.sign(directionalScore) * probabilityMargin, 0.28, 0.72);
  const probabilityUp = rawProbabilityUp;
  const confidence = Math.max(probabilityUp, 1 - probabilityUp);

  return {
    bucket,
    open,
    spot,
    high,
    low,
    elapsed,
    remaining,
    closePrice,
    direction,
    confidence,
    edgeFromOpen,
    distanceFromOpen,
    rangePosition,
    score,
    directionalScore,
    probabilityUp,
    isOpeningReference: false,
    factors: [
      { label: "Ouverture heure", value: fmtUsd.format(open) },
      { label: "Ecart actuel", value: fmtPct.format(distanceFromOpen) },
      { label: "Temps restant", value: `${remaining} min` },
      { label: "Position range", value: `${Math.round(rangePosition * 100)}%` },
      { label: "Biais dernieres heures", value: formatScore(recentBias) },
      { label: "Fiabilite recente", value: !backtest || backtest.accuracy === null ? "--" : `${Math.round(backtest.accuracy * 100)}%` }
    ]
  };
}

function buildSecureOpeningReference(candles, spot) {
  const reference = state.secureAnalysis?.opening;
  if (!reference) return null;
  const bucket = hourStart(candles.at(-1).time);
  if (Number(reference.bucket) !== bucket) return null;
  const currentHour = candles.filter((candle) => candle.time >= bucket);
  const high = Math.max(...currentHour.map((candle) => candle.high), spot);
  const low = Math.min(...currentHour.map((candle) => candle.low), spot);
  const open = Number(reference.open);
  const closePrice = Number(reference.closePrice);
  return {
    bucket,
    capturedAt: Number(reference.capturedAt) || bucket,
    isOpeningReference: true,
    isSecureReference: true,
    modelVersion: state.secureAnalysis.modelVersion,
    open,
    spot,
    high,
    low,
    elapsed: currentHour.length,
    remaining: Math.max(0, 60 - currentHour.length),
    closePrice,
    direction: reference.direction,
    confidence: Number(reference.confidence),
    probabilityUp: Number(reference.probabilityUp),
    edgeFromOpen: closePrice / open - 1,
    factors: [
      { label: "Source fixe", value: "Moteur prive" },
      { label: "Version modele", value: state.secureAnalysis.modelVersion },
      { label: "Regime ouverture", value: reference.regime },
      { label: "Acces", value: "Compte autorise" }
    ]
  };
}

function buildRemoteOpeningReference(candles, spot) {
  if (!state.studyObservations.length) return null;
  const bucket = hourStart(candles.at(-1).time);
  const row = state.studyObservations.find((observation) => Date.parse(observation.hour_open) === bucket);
  if (!row) return null;
  if (row.model_version !== FIXED_MODEL_VERSION) return null;
  const currentHour = candles.filter((candle) => candle.time >= bucket);
  const high = Math.max(...currentHour.map((candle) => candle.high), spot);
  const low = Math.min(...currentHour.map((candle) => candle.low), spot);
  return {
    bucket,
    capturedAt: Date.parse(row.hour_open),
    isOpeningReference: true,
    isRemoteReference: true,
    modelVersion: row.model_version,
    open: Number(row.opening_price),
    spot,
    high,
    low,
    elapsed: currentHour.length,
    remaining: Math.max(0, 60 - currentHour.length),
    closePrice: Number(row.predicted_close),
    direction: row.predicted_direction,
    confidence: Number(row.calibrated_confidence),
    probabilityUp: Number(row.features?.calibratedProbabilityUp),
    edgeFromOpen: Number(row.predicted_close) / Number(row.opening_price) - 1,
    factors: [
      { label: "Source fixe", value: "Base persistante" },
      { label: "Version modele", value: row.model_version },
      { label: "Regime ouverture", value: row.regime },
      { label: "Origine", value: row.prediction_origin === "live" ? "Prediction reelle" : "Rejeu historique" }
    ]
  };
}

function buildIndicatorSeries(candles, closes, returns) {
  const volumes = candles.map((candle) => candle.volume);
  const ema50Series = ema(closes, 50);
  const ema200Series = ema(closes, 200);
  const ema12Series = ema(closes, 12);
  const ema26Series = ema(closes, 26);
  const macdSeries = ema12Series.map((value, index) => value - ema26Series[index]);
  const volumeBase = movingAverage(volumes, 120);
  return {
    momentum15: rollingReturns(closes, 15).slice(-120),
    momentum60: rollingReturns(closes, 60).slice(-120),
    trend: closes.map((close, index) => close / Math.max(ema50Series[index], 0.000001) - 1).slice(-120),
    emaSpread: ema50Series.map((value, index) => value / Math.max(ema200Series[index], 0.000001) - 1).slice(-120),
    macd: macdSeries.slice(-120),
    rsi: rollingRsi(closes, 14).slice(-120),
    volume: volumes.map((value, index) => value / Math.max(volumeBase[index], 0.000001) - 1).slice(-120)
  };
}

function rollingReturns(values, period) {
  return values.map((value, index) => {
    if (index < period) return 0;
    return value / values[index - period] - 1;
  });
}

function movingAverage(values, period) {
  return values.map((_, index) => mean(values.slice(Math.max(0, index - period + 1), index + 1)));
}

function rollingRsi(values, period) {
  return values.map((_, index) => {
    if (index < period + 1) return 50;
    return rsi(values.slice(index - period - 1, index + 1));
  });
}

function atr(candles, period) {
  const trueRanges = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });
  return mean(trueRanges.slice(-period));
}

function buildSlotForecasts(spot, model, settings) {
  const now = new Date();
  const nextHour = getNextHour(now.getTime());
  const minutesToNextHour = clamp(Math.ceil((nextHour - now.getTime()) / 60000), 1, 60);
  const slots = [
    { label: "Maintenant", minutes: 0, detail: "Instant t" },
    { label: "Fin heure courante", minutes: minutesToNextHour, detail: fmtTime.format(new Date(nextHour)) },
    { label: "Heure suivante", minutes: minutesToNextHour + 60, detail: fmtTime.format(new Date(nextHour + 3600000)) },
    { label: "Horizon choisi", minutes: settings.horizon, detail: `${settings.horizon} min` }
  ];
  return slots.map((slot) => {
    const scale = slot.minutes === 0 ? 0 : slot.minutes / Math.max(settings.horizon, 1);
    const projectedReturn = slot.minutes === 0 ? 0 : clamp(model.projectedReturn * scale, -model.noise * 1.9, model.noise * 1.9);
    const price = spot * Math.exp(projectedReturn);
    return {
      ...slot,
      price,
      delta: price - spot,
      direction: Math.abs(projectedReturn) / Math.max(model.noise, 0.000001) < NEUTRAL_STRENGTH_THRESHOLD ? "~" : price >= spot ? "+" : "-"
    };
  });
}

function buildHourlyHistory(candles, limit) {
  const currentHour = hourStart(candles.at(-1).time);
  const groups = new Map();
  candles.forEach((candle) => {
    const bucket = hourStart(candle.time);
    if (bucket >= currentHour) return;
    if (!groups.has(bucket)) {
      groups.set(bucket, []);
    }
    groups.get(bucket).push(candle);
  });
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, limit)
    .map(([bucket, rows]) => {
      const open = rows[0].open;
      const close = rows.at(-1).close;
      const high = Math.max(...rows.map((row) => row.high));
      const low = Math.min(...rows.map((row) => row.low));
      const delta = close - open;
      const deltaPct = close / open - 1;
      const rangePct = high / low - 1;
      return {
        bucket,
        open,
        close,
        high,
        low,
        delta,
        deltaPct,
        rangePct,
        direction: delta >= 0 ? "+" : "-",
        complete: rows.length
      };
    });
}

function hourStart(time) {
  const date = new Date(time);
  date.setMinutes(0, 0, 0);
  return date.getTime();
}

function readHourlyHypotheses() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOURLY_HYPOTHESIS_STORAGE_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeHourlyHypotheses(value) {
  localStorage.setItem(HOURLY_HYPOTHESIS_STORAGE_KEY, JSON.stringify(value));
}

function updateHourlyHypothesis(result) {
  const now = Date.now();
  const bucket = hourStart(now);
  const key = String(bucket);
  const hypotheses = readHourlyHypotheses();
  const finHour = result.slotForecasts.find((slot) => slot.label === "Fin heure courante");
  const closeModel = result.hourlyClose;
  const desiredModel = closeModel?.isOpeningReference ? FIXED_MODEL_VERSION : closeModel ? "hourly-close" : "live-projection";
  const shouldCapture = !hypotheses[key] || hypotheses[key].model !== desiredModel;
  if (shouldCapture && (closeModel || finHour)) {
    hypotheses[key] = {
      bucket,
      capturedAt: closeModel?.capturedAt || now,
      startPrice: closeModel ? closeModel.open : result.spot,
      forecastPrice: closeModel ? closeModel.closePrice : finHour.price,
      forecastDelta: closeModel ? closeModel.closePrice - closeModel.open : finHour.delta,
      direction: closeModel ? closeModel.direction : finHour.direction,
      confidence: closeModel ? closeModel.confidence : result.confidence,
      model: desiredModel
    };
    pruneHourlyHypotheses(hypotheses);
    writeHourlyHypotheses(hypotheses);
  }
  return hypotheses[key] || null;
}

function pruneHourlyHypotheses(hypotheses) {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  Object.keys(hypotheses).forEach((key) => {
    if (Number(key) < cutoff) {
      delete hypotheses[key];
    }
  });
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function ema(values, period) {
  const multiplier = 2 / (period + 1);
  const result = [];
  let previous = values[0];
  values.forEach((value, index) => {
    previous = index === 0 ? value : value * multiplier + previous * (1 - multiplier);
    result.push(previous);
  });
  return result;
}

function bollinger(values, period, deviations) {
  const slice = values.slice(-period);
  const middle = mean(slice);
  const width = std(slice) * deviations;
  const upper = middle + width;
  const lower = middle - width;
  const last = values.at(-1);
  const position = (last - lower) / Math.max(upper - lower, 0.000001);
  return { upper, middle, lower, position: clamp(position, 0, 1) };
}

function classifyRegime(volatilityRatio, trendStrength, momentumStrength) {
  const highVol = volatilityRatio > 1.35;
  const lowVol = volatilityRatio < 0.75;
  const trending = trendStrength > 0.002 || momentumStrength > 0.004;
  const label = highVol ? "volatil" : lowVol ? "calme" : trending ? "directionnel" : "neutre";
  const confidenceMultiplier = highVol ? 0.78 : lowVol ? 0.9 : trending ? 1.08 : 0.95;
  return { label, confidenceMultiplier };
}

function rsi(closes) {
  const changes = closes.slice(1).map((value, index) => value - closes[index]);
  const gains = changes.map((value) => Math.max(0, value)).slice(-14);
  const losses = changes.map((value) => Math.max(0, -value)).slice(-14);
  const avgGain = mean(gains);
  const avgLoss = Math.max(0.0000001, mean(losses));
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function renderMetrics(result) {
  const decision = result.profitDecision;
  els.signalCard.className = `hero-signal ${directionClass(decision.direction)}`;
  els.directionValue.textContent = decision.direction === "+" || decision.direction === "-" ? decision.direction : "--";
  const confidence = Math.round((decision.signalProbability || 0.5) * 100);
  const directionWord = decision.direction === "+" ? "hausse" : "baisse";
  if (decision.status === "action") {
    els.directionText.textContent = `JOUER CETTE HEURE · Acheter ${decision.outcome}`;
    els.directionContext.textContent = `Direction ${directionWord} · confiance ${confidence}% · cout avec frais ${formatCents(decision.totalCost)} · avantage ${formatSignedCents(decision.expectedValue)}.`;
  } else if (decision.status === "missing-market") {
    els.directionText.textContent = "NE PAS JOUER · prix du marche manquant";
    els.directionContext.textContent = `Direction ${directionWord} · confiance ${confidence}%. Charge le creneau Polymarket pour verifier la rentabilite apres frais.`;
  } else if (decision.status === "no-value") {
    els.directionText.textContent = "NE PAS JOUER CETTE HEURE";
    els.directionContext.textContent = `Direction ${directionWord} · confiance ${confidence}% · cout ${formatCents(decision.totalCost)} · avantage net ${formatSignedCents(decision.expectedValue)} insuffisant.`;
  } else if (decision.status === "legacy-model") {
    els.directionText.textContent = "NE PAS JOUER · repere incomplet";
    els.directionContext.textContent = `Direction ${directionWord} · confiance ${confidence}%. Le nouveau modele prend le relais des que toutes les donnees sont disponibles.`;
  } else {
    els.directionText.textContent = "NE PAS JOUER CETTE HEURE";
    els.directionContext.textContent = `Direction ${directionWord} · confiance ${confidence}%. Une orientation existe, mais elle est trop faible pour risquer de l'argent.`;
  }
  els.spotValue.textContent = fmtUsd.format(result.spot);
  els.forecastValue.textContent = fmtUsd.format(result.forecast);
  els.forecastContext.textContent = `Confiance variable ${Math.round(result.confidence * 100)}% | horizon ${result.settings.horizon} min`;
  if (result.hourlyHypothesis) {
    const fixedDelta = result.hourlyHypothesis.forecastPrice - result.hourlyHypothesis.startPrice;
    els.fixedTargetValue.textContent = fmtUsd.format(result.hourlyHypothesis.forecastPrice);
    els.fixedTargetContext.textContent = `Confiance fixe ${Math.round(result.hourlyHypothesis.confidence * 100)}% | ${fmtDelta.format(fixedDelta)} depuis ouverture`;
  } else {
    els.fixedTargetValue.textContent = "--";
    els.fixedTargetContext.textContent = "Repere calcule au debut de l'heure";
  }
  els.deltaValue.textContent = fmtDelta.format(result.delta);
  els.deltaContext.textContent = fmtPct.format(result.deltaPct);
  els.chartBadge.textContent = timeToNextHourLabel(new Date());
}

function renderPlainSummary(result) {
  const decision = result.profitDecision;
  const liveDirection = displayDirection(result.direction, { value: result.forecast, reference: result.spot });
  const fixed = result.hourlyClose;
  const fixedDirection = fixed
    ? displayDirection(fixed.direction, { probabilityUp: fixed.probabilityUp, value: fixed.closePrice, reference: fixed.open })
    : null;
  const confidence = Math.round((decision.signalProbability || 0.5) * 100);
  const decisionText = decision.action
    ? `<strong class="summary-action is-play">JOUER</strong><span>Avantage net estime ${formatSignedCents(decision.expectedValue)} par part au prix actuel.</span>`
    : decision.status === "missing-market"
      ? `<strong class="summary-action">NE PAS JOUER</strong><span>Le prix Polymarket est requis pour verifier la rentabilite.</span>`
      : `<strong class="summary-action">NE PAS JOUER</strong><span>Le filtre ne trouve pas assez d'avantage pour risquer une mise.</span>`;
  els.plainSummary.innerHTML = `
    <p class="summary-decision">${decisionText}</p>
    <p><strong>Direction retenue ${decision.direction}</strong><span>Confiance ${confidence}% · ${decision.direction === "+" ? "biais haussier" : "biais baissier"}.</span></p>
    <p><strong>Lecture en direct ${liveDirection}</strong><span>Objectif ${fmtUsd.format(result.forecast)} · ${fmtDelta.format(result.delta)} depuis maintenant.</span></p>
    ${fixed ? `<p><strong>Fin d'heure ${fixedDirection}</strong><span>Cloture estimee ${fmtUsd.format(fixed.closePrice)} · ouverture ${fmtUsd.format(fixed.open)}.</span></p>` : ""}
  `;
}

function renderHypotheses(result) {
  const liveDirection = displayDirection(result.direction, { value: result.forecast, reference: result.spot });
  els.liveHypothesisCard.className = `hypothesis-card ${directionClass(liveDirection)}`;
  els.liveHypothesisValue.textContent = `${liveDirection} ${Math.round(result.confidence * 100)}%`;
  els.liveHypothesisContext.textContent = `Cap live ${fmtUsd.format(result.forecast)} (${fmtDelta.format(result.delta)}). Ce signal n'est pas une cote de pari.`;

  const fixed = result.hourlyHypothesis;
  if (!fixed) {
    els.fixedHypothesisCard.className = "hypothesis-card";
    els.fixedHypothesisValue.textContent = "--";
    els.fixedHypothesisContext.textContent = "En attente de capture horaire.";
    return;
  }
  const fixedDirection = displayDirection(fixed.direction, { value: fixed.forecastPrice, reference: fixed.startPrice });
  els.fixedHypothesisCard.className = `hypothesis-card ${directionClass(fixedDirection)}`;
  els.fixedHypothesisValue.textContent = `${fixedDirection} ${Math.round(fixed.confidence * 100)}%`;
  els.fixedHypothesisContext.textContent = `Repere garde pour juger l'heure: ouverture ${fmtTime.format(new Date(fixed.capturedAt))}, cloture estimee ${fmtUsd.format(fixed.forecastPrice)}.`;
}

function renderHourlyCloseModel(hourlyClose) {
  if (!els.hourlyCloseCard || !hourlyClose) return;
  const direction = displayDirection(hourlyClose.direction, {
    probabilityUp: hourlyClose.probabilityUp,
    value: hourlyClose.closePrice,
    reference: hourlyClose.open
  });
  els.hourlyCloseCard.className = `hourly-close-main ${directionClass(direction)}`;
  els.hourlyCloseValue.textContent = `${direction} ${Math.round(hourlyClose.confidence * 100)}%`;
  els.hourlyCloseContext.textContent = `Ouverture ${fmtUsd.format(hourlyClose.open)} | cloture estimee ${fmtUsd.format(hourlyClose.closePrice)} | ${fmtDelta.format(hourlyClose.closePrice - hourlyClose.open)} vs ouverture.`;
  els.hourlyCloseFactors.innerHTML = "";
  hourlyClose.factors.forEach((factor) => {
    const node = document.createElement("article");
    node.className = "hourly-factor";
    node.innerHTML = `<span>${factor.label}</span><strong>${factor.value}</strong>`;
    els.hourlyCloseFactors.appendChild(node);
  });
}

function renderSignals(result) {
  const s = result.model.scores;
  const items = [
    {
      title: "Momentum 15 min",
      text: `${fmtPct.format(result.model.momentum15)} | score ${formatScore(s.momentum15)}`,
      series: result.model.series.momentum15,
      mode: "signed"
    },
    {
      title: "Momentum 60 min",
      text: `${fmtPct.format(result.model.momentum60)} | score ${formatScore(s.momentum60)}`,
      series: result.model.series.momentum60,
      mode: "signed"
    },
    {
      title: "Tendance EMA",
      text: `EMA50 ${fmtUsd.format(result.model.ema50)} | EMA200 ${fmtUsd.format(result.model.ema200)} | score ${formatScore(s.trend)}`,
      series: result.model.series.emaSpread,
      mode: "signed"
    },
    {
      title: "MACD + RSI",
      text: `MACD ${formatScore(s.macd)} | RSI ${result.model.rsiValue.toFixed(1)} | score RSI ${formatScore(s.rsi)}`,
      series: result.model.series.macd,
      mode: "signed"
    },
    {
      title: "Bandes et volume",
      text: `Bollinger ${Math.round(result.model.bb.position * 100)}% | volume x${result.model.volumeRatio.toFixed(2)} | score ${formatScore((s.bands + s.volume) / 2)}`,
      series: result.model.series.volume,
      mode: "signed"
    },
    {
      title: "Volatilite et regime",
      text: `Bruit attendu ${fmtPct.format(result.model.noise)} | regime ${result.model.regime.label} | vol x${result.model.volatilityRatio.toFixed(2)}`,
      series: result.model.series.rsi,
      mode: "bounded"
    },
    {
      title: "Lecture",
      text: result.direction === "+"
        ? "Le faisceau de signaux penche vers une pression acheteuse."
        : result.direction === "-"
          ? "Le faisceau de signaux penche vers une pression vendeuse."
          : "Le faisceau de signaux reste trop proche du bruit pour trancher proprement."
    }
  ];
  els.signalList.innerHTML = "";
  items.forEach((item) => {
    const node = document.createElement("div");
    node.className = "signal-item";
    node.innerHTML = `<strong>${item.title}</strong><small>${item.text}</small>`;
    if (result.settings.showIndicatorCharts && item.series) {
      node.appendChild(renderMiniChart(item.series, item.mode));
    }
    els.signalList.appendChild(node);
  });
}

function renderSlots(result) {
  els.slotGrid.innerHTML = "";
  result.slotForecasts.forEach((slot) => {
    const direction = displayDirection(slot.direction, { value: slot.price, reference: result.spot });
    const node = document.createElement("article");
    node.className = `slot-card ${directionClass(direction)}`;
    node.innerHTML = `
      <span>${slot.label}</span>
      <strong>${direction} ${fmtUsd.format(slot.price)}</strong>
      <small>${slot.detail} | ${fmtDelta.format(slot.delta)}</small>
    `;
    els.slotGrid.appendChild(node);
  });
}

function renderStudyNotes(result) {
  const model = result.model;
  const direction = displayDirection(result.direction, { value: result.forecast, reference: result.spot });
  const invalidation = result.direction === "~"
    ? result.spot
    : result.direction === "+"
      ? model.recentLow + (result.spot - model.recentLow) * 0.35
      : model.recentHigh - (model.recentHigh - result.spot) * 0.35;
  const nextSlot = result.slotForecasts.find((slot) => slot.label === "Heure suivante");
  const notes = [
    {
      title: "Structure du range",
      text: `BTC est a ${Math.round(model.rangePosition * 100)}% du range 2h. Bas ${fmtUsd.format(model.recentLow)}, haut ${fmtUsd.format(model.recentHigh)}.`
    },
    {
      title: "Point d'invalidation",
      text: result.direction === "~"
        ? `Le biais ${direction} reste faible : ne pas jouer tant que le signal ne se separe pas davantage du bruit.`
        : `Le biais ${direction} devient fragile autour de ${fmtUsd.format(invalidation)} si le prix s'y installe.`
    },
    {
      title: "Heure suivante",
      text: nextSlot ? `Projection ${displayDirection(nextSlot.direction, { value: nextSlot.price, reference: result.spot })} vers ${fmtUsd.format(nextSlot.price)}, soit ${fmtDelta.format(nextSlot.delta)} depuis maintenant.` : "Projection indisponible."
    },
    {
      title: "Amplitude normale",
      text: `ATR court ${fmtUsd.format(model.atrValue)}. Un mouvement inferieur a cette zone peut etre du bruit.`
    },
    {
      title: "Ce qui compte maintenant",
      text: studyFocus(result)
    }
  ];
  els.studyList.innerHTML = "";
  notes.forEach((note) => {
    const node = document.createElement("article");
    node.className = "study-item";
    node.innerHTML = `<strong>${note.title}</strong><small>${note.text}</small>`;
    els.studyList.appendChild(node);
  });
}

async function refreshStudyDatabase(force = false) {
  if (!els.studyDatabase || !els.databaseStatus) return;
  const url = String(remoteConfig.supabaseUrl || "").replace(/\/$/, "");
  const key = String(remoteConfig.supabaseAnonKey || "");
  if (!url || !key) {
    els.databaseStatus.textContent = "Configuration requise";
    els.databaseStatus.className = "database-status is-local";
    renderStudyDatabase([]);
    return;
  }
  const session = await getValidSession();
  if (!session || state.profile?.status !== "approved") {
    els.databaseStatus.textContent = "Compte autorise requis";
    els.databaseStatus.className = "database-status is-error";
    return;
  }
  if (!force && state.studyObservations.length && Date.now() - state.lastStudyFetch < 60000) return;
  els.databaseStatus.textContent = "Synchronisation...";
  els.databaseStatus.className = "database-status is-syncing";
  const fields = [
    "hour_open", "prediction_origin", "model_version", "opening_price", "predicted_close",
    "predicted_direction", "calibrated_confidence", "regime", "actual_close",
    "actual_direction", "verdict", "absolute_error_pct", "features"
  ].join(",");
  const requestHeaders = { apikey: key, Authorization: `Bearer ${session.access_token}` };
  const [response, summaryResponse] = await Promise.all([
    fetch(`${url}/rest/v1/hourly_observations?select=${fields}&order=hour_open.desc&limit=1000`, { headers: requestHeaders }),
    fetch(`${url}/rest/v1/hourly_study_overview?select=*`, { headers: requestHeaders })
  ]);
  if (!response.ok || !summaryResponse.ok) {
    const status = !response.ok ? response.status : summaryResponse.status;
    els.databaseStatus.textContent = `Base indisponible (${status})`;
    els.databaseStatus.className = "database-status is-error";
    throw new Error(`Base d'etude: ${status}`);
  }
  state.studyObservations = await response.json();
  state.studySummary = (await summaryResponse.json())[0] || null;
  state.lastStudyFetch = Date.now();
  const total = Number(state.studySummary?.total) || state.studyObservations.length;
  els.databaseStatus.textContent = `Connectee · ${total} h memorisees`;
  els.databaseStatus.className = "database-status is-connected";
  renderStudyDatabase(state.studyObservations, state.studySummary);
  if (state.candles.length >= 240) analyze();
}

function observationAccuracy(rows) {
  const judged = rows.filter((row) => row.verdict === "correct" || row.verdict === "wrong");
  if (!judged.length) return null;
  return judged.filter((row) => row.verdict === "correct").length / judged.length;
}

function studyBar(label, rows) {
  const judged = rows.filter((row) => row.verdict === "correct" || row.verdict === "wrong");
  const accuracy = observationAccuracy(rows);
  const width = accuracy === null ? 0 : Math.round(accuracy * 100);
  return `
    <article class="study-band">
      <div><span>${label}</span><strong>${accuracy === null ? "--" : `${width}%`}</strong></div>
      <div class="study-band-track"><i style="width:${width}%"></i></div>
      <small>${judged.length} decisions tranchees</small>
    </article>
  `;
}

function renderStudyDatabase(rows, summary = null) {
  if (!els.studyDatabase) return;
  if (!remoteConfig.supabaseUrl || !remoteConfig.supabaseAnonKey) {
    els.studyDatabase.innerHTML = `
      <div class="database-empty">
        <strong>Le moteur distant est pret a etre branche.</strong>
        <span>Renseigne l'URL et la cle publique Supabase dans config.js. Le mode live BTC continue normalement pendant ce temps.</span>
      </div>
    `;
    return;
  }
  if (!rows.length) {
    els.studyDatabase.innerHTML = '<div class="supervision-empty">Base connectee. La premiere observation apparaitra au prochain passage du collecteur.</div>';
    return;
  }

  const currentModelRows = rows.filter((row) => row.model_version === FIXED_MODEL_VERSION);
  const live = rows.filter((row) => row.prediction_origin === "live");
  const replay = rows.filter((row) => row.prediction_origin === "replay");
  const currentLive = currentModelRows.filter((row) => row.prediction_origin === "live");
  const realRows = currentLive.length ? currentLive : currentModelRows;
  const judged = realRows.filter((row) => row.verdict === "correct" || row.verdict === "wrong");
  const neutral = realRows.filter((row) => row.verdict === "neutral");
  const pending = realRows.filter((row) => row.verdict === "pending");
  const completed = realRows.filter((row) => row.actual_close !== null && row.actual_close !== "" && Number.isFinite(Number(row.actual_close)));
  const winsCount = judged.filter((row) => row.verdict === "correct").length;
  const lossesCount = judged.filter((row) => row.verdict === "wrong").length;
  const accuracy = judged.length ? winsCount / judged.length : null;
  const averageError = completed.length ? mean(completed.map((row) => Number(row.absolute_error_pct) || 0)) : null;

  const regimes = ["directionnel", "volatil", "calme", "neutre"]
    .map((regime) => studyBar(`Regime ${regime}`, currentModelRows.filter((row) => row.regime === regime)))
    .join("");
  const confidenceBands = [
    { label: "Confiance < 55%", min: 0, max: 0.55 },
    { label: "Confiance 55-60%", min: 0.55, max: 0.60 },
    { label: "Confiance 60-65%", min: 0.60, max: 0.65 },
    { label: "Confiance > 65%", min: 0.65, max: 1.01 }
  ].map((band) => studyBar(
    band.label,
    currentModelRows.filter((row) => Number(row.calibrated_confidence) >= band.min && Number(row.calibrated_confidence) < band.max)
  )).join("");

  const timeline = realRows.slice(0, 24).map((row) => {
    const date = new Date(row.hour_open);
    const direction = displayDirection(row.predicted_direction, {
      value: row.predicted_close,
      reference: row.opening_price
    });
    const verdictLabel = row.verdict === "correct"
      ? "JUSTE"
      : row.verdict === "wrong"
        ? "FAUX"
        : row.verdict === "neutral"
          ? "SANS MISE"
          : "EN COURS";
    const predictedPrice = Number(row.predicted_close);
    const hasActualPrice = row.actual_close !== null && row.actual_close !== "" && Number.isFinite(Number(row.actual_close));
    const actualPrice = hasActualPrice ? Number(row.actual_close) : null;
    const hasError = row.absolute_error_pct !== null && row.absolute_error_pct !== "" && Number.isFinite(Number(row.absolute_error_pct));
    const priceDetail = hasActualPrice
      ? `Prevu ${fmtUsd.format(predictedPrice)} · reel ${fmtUsd.format(actualPrice)}`
      : `Cloture prevue ${fmtUsd.format(predictedPrice)}`;
    return `
      <article class="study-hour-row ${directionClass(direction)} verdict-${row.verdict}">
        <div class="study-hour-time">
          <strong>${fmtTime.format(date)}</strong>
          <small>${date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}</small>
        </div>
        <div class="study-hour-direction">
          <strong>${direction}</strong>
          <span>confiance ${Math.round(Number(row.calibrated_confidence) * 100)}%</span>
        </div>
        <div class="study-hour-prices">
          <span>${priceDetail}</span>
          <small>${hasError ? `Erreur ${fmtAbsPct.format(Math.abs(Number(row.absolute_error_pct)))}` : `Regime ${row.regime}`}</small>
        </div>
        <strong class="study-hour-verdict">${verdictLabel}</strong>
      </article>
    `;
  }).join("");

  els.studyDatabase.innerHTML = `
    <section class="study-overview" aria-label="Bilan des analyses horaires">
      <article><span>Heures observees</span><strong>${realRows.length}</strong><small>predictions faites en conditions reelles</small></article>
      <article><span>Decisions prises</span><strong>${judged.length}</strong><small>${winsCount} juste${winsCount > 1 ? "s" : ""} · ${lossesCount} fausse${lossesCount > 1 ? "s" : ""}</small></article>
      <article class="${accuracy !== null && accuracy >= 0.55 ? "is-good" : accuracy === null ? "" : "is-bad"}"><span>Taux de reussite</span><strong>${accuracy === null ? "--" : `${Math.round(accuracy * 100)}%`}</strong><small>uniquement sur les heures jouables</small></article>
      <article><span>Heures sans mise</span><strong>${neutral.length}</strong><small>direction donnee, risque refuse</small></article>
      <article><span>Erreur de prix moyenne</span><strong>${averageError === null ? "--" : fmtAbsPct.format(Math.abs(averageError))}</strong><small>objectif compare a la cloture reelle</small></article>
      <article><span>En cours</span><strong>${pending.length}</strong><small>resultat connu a la fin de l'heure</small></article>
    </section>
    <section class="study-hour-list-wrap">
      <div class="study-section-head">
        <div><h3>Detail heure par heure</h3><p>Chaque ligne montre la direction, la confiance, les prix et la decision finale.</p></div>
        <span>${Math.min(24, realRows.length)} heures affichees</span>
      </div>
      <div class="study-hour-list">${timeline}</div>
    </section>
    <details class="study-technical-details">
      <summary>Voir les statistiques techniques</summary>
      <section class="study-breakdowns">
        <div><h3>Precision par regime</h3>${regimes}</div>
        <div><h3>Precision par niveau de confiance</h3>${confidenceBands}</div>
      </section>
      <p class="study-technical-note">Base complete : ${Number(summary?.total) || rows.length} heures · ${Number(summary?.live_total) || live.length} reelles · ${Number(summary?.replay_total) || replay.length} rejouees.</p>
    </details>
  `;
}

function renderSupervision(result) {
  const backtest = result.backtest;
  if (!els.modelSupervision) return;
  if (!backtest.rows.length) {
    els.modelSupervision.innerHTML = '<div class="supervision-empty">Pas encore assez de donnees pour superviser le moteur.</div>';
    return;
  }
  const accuracyText = backtest.accuracy === null ? "--" : `${Math.round(backtest.accuracy * 100)}%`;
  const confidenceMove = result.confidence - result.rawConfidence;
  const recentRows = backtest.rows.slice(-6).reverse().map((row) => {
    const direction = displayDirection(row.orientation || row.predicted);
    const verdict = row.correct === null ? "sans mise" : row.correct ? "juste" : "faux";
    return `
      <article class="supervision-row ${directionClass(direction)}">
        <span>${fmtTime.format(new Date(row.bucket))}</span>
        <strong>${direction} → ${row.actual}</strong>
        <small>${verdict} | confiance ${Math.round(row.confidence * 100)}%</small>
      </article>
    `;
  }).join("");

  els.modelSupervision.innerHTML = `
    <article class="supervision-stat">
      <span>Reussite recente</span>
      <strong>${accuracyText}</strong>
      <small>${backtest.wins}/${backtest.attempted} signaux tranches</small>
    </article>
    <article class="supervision-stat">
      <span>Zones neutres</span>
      <strong>${backtest.neutral}</strong>
      <small>heures ignorees car trop bruitees</small>
    </article>
    <article class="supervision-stat">
      <span>Erreur moyenne</span>
      <strong>${backtest.averageError === null ? "--" : fmtPct.format(backtest.averageError)}</strong>
      <small>ecart entre projection et cloture</small>
    </article>
    <article class="supervision-stat">
      <span>Correction confiance</span>
      <strong>${fmtPct.format(confidenceMove)}</strong>
      <small>brut ${Math.round(result.rawConfidence * 100)}% -> affiche ${Math.round(result.confidence * 100)}%</small>
    </article>
    <div class="supervision-history">${recentRows}</div>
  `;
}

function renderHourlyHistory(hours) {
  els.hourHistory.innerHTML = "";
  const hypotheses = readHourlyHypotheses();
  if (!hours.length) {
    els.hourHistory.innerHTML = '<div class="history-empty">Pas encore assez de donnees horaires.</div>';
    return;
  }
  hours.forEach((hour) => {
    const start = new Date(hour.bucket);
    const end = new Date(hour.bucket + 3600000);
    const fixed = hypotheses[String(hour.bucket)];
    const fixedDirection = fixed
      ? displayDirection(fixed.direction, { value: fixed.forecastPrice, reference: fixed.startPrice })
      : null;
    const verdict = fixed ? (fixed.direction === "~" ? "sans mise" : fixedDirection === hour.direction ? "juste" : "faux") : "non capturee";
    const node = document.createElement("article");
    node.className = `history-card ${directionClass(hour.direction)}`;
    node.innerHTML = `
      <span>${fmtTime.format(start)}-${fmtTime.format(end)}</span>
      <strong>${hour.direction} ${fmtPct.format(hour.deltaPct)}</strong>
      <small>O ${fmtUsd.format(hour.open)} | C ${fmtUsd.format(hour.close)}</small>
      <small>Range ${fmtPct.format(hour.rangePct)} | ${hour.complete} min</small>
      <small>Hypothese fixe : ${fixedDirection || "--"} ${verdict}</small>
    `;
    els.hourHistory.appendChild(node);
  });
}

function studyFocus(result) {
  const model = result.model;
  if (model.regime.label === "volatil") {
    return "Regime volatil : privilegie la confirmation par clotures successives, pas seulement une impulsion rapide.";
  }
  if (Math.abs(model.scores.trend) > 0.55 && Math.abs(model.scores.momentum) > 0.45) {
    return "Tendance et momentum sont alignes : surveille surtout si le volume confirme ou s'essouffle.";
  }
  if (model.rsiValue > 70 || model.rsiValue < 30) {
    return "RSI extreme : le signal existe, mais le risque de respiration courte augmente.";
  }
  if (Math.abs(result.delta) < model.atrValue * 0.4) {
    return "Ecart anticipe faible face au bruit : attendre une meilleure separation peut etre plus propre.";
  }
  return "Lecture equilibree : observe la reaction du prix autour des heures pleines et du range recent.";
}

function directionClass(direction) {
  if (direction === "+") return "is-plus";
  if (direction === "-") return "is-minus";
  return "is-neutral";
}

function renderMiniChart(values, mode) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "mini-chart");
  svg.setAttribute("viewBox", "0 0 240 56");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Mini graphique indicateur");
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return svg;
  const min = mode === "bounded" ? 0 : Math.min(...clean, 0);
  const max = mode === "bounded" ? 100 : Math.max(...clean, 0);
  const y = (value) => 48 - (value - min) * (40 / Math.max(max - min, 0.000001));
  const x = (index) => 6 + index * (228 / Math.max(clean.length - 1, 1));
  const zeroY = mode === "bounded" ? y(50) : y(0);
  miniLine(svg, 6, zeroY, 234, zeroY, "mini-zero");
  const path = clean.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  const lineNode = document.createElementNS("http://www.w3.org/2000/svg", "path");
  lineNode.setAttribute("d", path);
  lineNode.setAttribute("class", clean.at(-1) >= (mode === "bounded" ? 50 : 0) ? "mini-line plus" : "mini-line minus");
  svg.appendChild(lineNode);
  return svg;
}

function miniLine(svg, x1, y1, x2, y2, className) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "line");
  node.setAttribute("x1", x1);
  node.setAttribute("y1", y1);
  node.setAttribute("x2", x2);
  node.setAttribute("y2", y2);
  node.setAttribute("class", className);
  svg.appendChild(node);
}

function formatScore(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function renderChart({ forecast, spot }) {
  const svg = els.priceChart;
  const width = svg.clientWidth || 800;
  const height = svg.clientHeight || 400;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = "";
  const candles = state.candles.slice(-240);
  const pad = { left: 58, right: 18, top: 18, bottom: 56 };
  const lastTime = candles.at(-1).time;
  const nextHour = getNextHour(lastTime);
  const futureTime = Math.max(lastTime + getSettings().horizon * 60000, nextHour);
  const startTime = candles[0].time;
  const plotLeft = pad.left;
  const plotRight = width - pad.right;
  const x = (time) => plotLeft + (time - startTime) * ((plotRight - plotLeft) / Math.max(1, futureTime - startTime));
  const xs = candles.map((candle) => x(candle.time));
  const values = candles.flatMap((candle) => [candle.high, candle.low]).concat([forecast, spot]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const buffer = Math.max(10, (max - min) * 0.08);
  const yMin = min - buffer;
  const yMax = max + buffer;
  const y = (value) => pad.top + (yMax - value) * ((height - pad.top - pad.bottom) / (yMax - yMin));
  const path = candles.map((candle, index) => `${index === 0 ? "M" : "L"} ${xs[index].toFixed(1)} ${y(candle.close).toFixed(1)}`).join(" ");

  [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
    const yy = pad.top + ratio * (height - pad.top - pad.bottom);
    line(svg, pad.left, yy, width - pad.right, yy, "grid");
    text(svg, 8, yy + 4, fmtUsd.format(yMax - ratio * (yMax - yMin)), "chart-label");
  });
  line(svg, pad.left, pad.top, pad.left, height - pad.bottom, "axis");
  line(svg, pad.left, height - pad.bottom, width - pad.right, height - pad.bottom, "axis");
  renderTimeAxis(svg, { startTime, lastTime, nextHour, futureTime, x, yTop: pad.top, yBottom: height - pad.bottom, width });

  const pricePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pricePath.setAttribute("d", path);
  pricePath.setAttribute("class", "price-line");
  svg.appendChild(pricePath);

  const lastX = xs.at(-1);
  const futureX = x(lastTime + getSettings().horizon * 60000);
  line(svg, lastX, y(spot), futureX, y(forecast), forecast >= spot ? "projection-line plus" : "projection-line minus");
  circle(svg, lastX, y(spot), 4, "var(--accent)");
  circle(svg, futureX, y(forecast), 5, forecast >= spot ? "var(--good)" : "var(--bad)");
  text(svg, Math.max(pad.left, futureX - 122), y(forecast) - 10, `Anticipe ${fmtUsd.format(forecast)}`, "chart-label");
  text(svg, Math.max(pad.left, lastX - 110), y(spot) + 20, `Actuel ${fmtUsd.format(spot)}`, "chart-label");
}

function renderTimeAxis(svg, timeline) {
  const { startTime, lastTime, nextHour, futureTime, x, yTop, yBottom, width } = timeline;
  const firstTick = Math.ceil(startTime / 900000) * 900000;
  for (let tick = firstTick; tick <= futureTime; tick += 900000) {
    const xx = x(tick);
    const date = new Date(tick);
    const isHour = date.getMinutes() === 0;
    line(svg, xx, isHour ? yTop : yBottom - 6, xx, yBottom, isHour ? "hour-grid" : "time-tick");
    if (isHour || width > 720) {
      text(svg, xx - 18, yBottom + 20, fmtTime.format(date), isHour ? "time-label hour-label" : "time-label");
    }
  }

  const nextHourX = x(nextHour);
  line(svg, nextHourX, yTop, nextHourX, yBottom, "next-hour-line");
  rect(svg, x(lastTime), yTop, Math.max(2, nextHourX - x(lastTime)), yBottom - yTop, "remaining-window");
  text(svg, Math.max(60, Math.min(width - 160, nextHourX - 132)), yTop + 16, timeToNextHourLabel(new Date(lastTime)), "next-hour-label");
}

function getNextHour(time) {
  const date = new Date(time);
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date.getTime();
}

function timeToNextHourLabel(date) {
  const nextHour = getNextHour(date.getTime());
  const totalSeconds = Math.max(0, Math.ceil((nextHour - date.getTime()) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `reste ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function line(svg, x1, y1, x2, y2, className) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "line");
  node.setAttribute("x1", x1);
  node.setAttribute("y1", y1);
  node.setAttribute("x2", x2);
  node.setAttribute("y2", y2);
  node.setAttribute("class", className);
  svg.appendChild(node);
}

function text(svg, x, y, value, className) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
  node.setAttribute("x", x);
  node.setAttribute("y", y);
  node.setAttribute("class", className);
  node.textContent = value;
  svg.appendChild(node);
}

function rect(svg, x, y, width, height, className) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  node.setAttribute("x", x);
  node.setAttribute("y", y);
  node.setAttribute("width", width);
  node.setAttribute("height", height);
  node.setAttribute("class", className);
  svg.appendChild(node);
}

function circle(svg, cx, cy, r, fill) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  node.setAttribute("cx", cx);
  node.setAttribute("cy", cy);
  node.setAttribute("r", r);
  node.setAttribute("fill", fill);
  svg.appendChild(node);
}

function restartLiveTimer() {
  if (state.liveTimer) clearInterval(state.liveTimer);
  state.liveTimer = null;
  if (!els.liveToggle.checked || state.quotaLocked) return;
  state.liveTimer = setInterval(() => {
    fetchSecureAnalysis().catch(showError);
  }, 10000);
}

function setStatus(message) {
  els.statusLine.textContent = message;
}

function log(message) {
  const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const line = document.createElement("div");
  line.textContent = `${time} - ${message}`;
  els.logBox.prepend(line);
}

function bindEvents() {
  els.logoutBtn.addEventListener("click", signOut);
  els.refreshAccessUsersBtn.addEventListener("click", () => loadAccessUsers().catch(showError));
  els.shareBtn.addEventListener("click", shareApp);
  els.rewardAdBtn.addEventListener("click", grantRewardTime);
  els.overlayRewardAdBtn.addEventListener("click", grantRewardTime);
  els.refreshBtn.addEventListener("click", () => fetchSecureAnalysis().catch(showError));
  els.loadMarketBtn.addEventListener("click", () => loadMarketFromUrl().catch(showError));
  els.liveToggle.addEventListener("change", restartLiveTimer);
  els.decisionAlertsToggle?.addEventListener("change", async () => {
    if (!els.decisionAlertsToggle.checked || typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      els.decisionAlertsToggle.checked = false;
      setStatus("Notifications non autorisees par le navigateur.");
    } else {
      setStatus("Alertes activees : BTC1H signalera uniquement une occasion nette.");
      analyze();
    }
  });
  [els.horizonInput, els.sensitivityInput, els.indicatorChartsToggle].forEach((input) => {
    input.addEventListener("input", analyze);
    input.addEventListener("change", analyze);
  });
  window.addEventListener("resize", analyze);
  document.addEventListener("visibilitychange", syncQuotaClock);
}

function getQuotaDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function readQuota() {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUOTA_STORAGE_KEY));
    if (parsed?.date === getQuotaDateKey()) {
      return {
        date: parsed.date,
        usedMs: Number(parsed.usedMs) || 0,
        bonusMs: Number(parsed.bonusMs) || 0,
        lastTick: Number(parsed.lastTick) || Date.now()
      };
    }
  } catch {
    // Ignore invalid local quota data and start fresh.
  }
  return {
    date: getQuotaDateKey(),
    usedMs: 0,
    bonusMs: 0,
    lastTick: Date.now()
  };
}

function writeQuota(quota) {
  localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(quota));
}

function getQuotaAllowance(quota) {
  return QUOTA_BASE_MS + quota.bonusMs;
}

function syncQuotaClock() {
  const quota = readQuota();
  const now = Date.now();
  if (!document.hidden && !state.quotaLocked) {
    quota.usedMs += Math.max(0, now - quota.lastTick);
  }
  quota.lastTick = now;
  writeQuota(quota);
  renderQuota(quota);
}

function renderQuota(quota = readQuota()) {
  const allowance = getQuotaAllowance(quota);
  const remaining = Math.max(0, allowance - quota.usedMs);
  const ratio = clamp(remaining / Math.max(allowance, 1), 0, 1);
  els.quotaTimeValue.textContent = formatDuration(remaining);
  els.quotaFill.style.width = `${Math.round(ratio * 100)}%`;
  const shouldLock = remaining <= 0;
  state.quotaLocked = shouldLock;
  els.quotaOverlay.hidden = !shouldLock;
  document.body.classList.toggle("is-quota-locked", shouldLock);
  if (shouldLock) {
    if (state.liveTimer) clearInterval(state.liveTimer);
    state.liveTimer = null;
    setStatus("Temps gratuit termine.");
  } else if (!state.liveTimer && els.liveToggle.checked) {
    restartLiveTimer();
  }
}

function startQuotaTimer() {
  syncQuotaClock();
  if (state.quotaTimer) clearInterval(state.quotaTimer);
  state.quotaTimer = setInterval(syncQuotaClock, 1000);
}

function grantRewardTime() {
  const quota = readQuota();
  quota.bonusMs += QUOTA_REWARD_MS;
  quota.lastTick = Date.now();
  writeQuota(quota);
  state.quotaLocked = false;
  renderQuota(quota);
  setStatus("Pub validee : 2h ajoutees.");
  fetchSecureAnalysis().catch(showError);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

async function shareApp() {
  const shareData = {
    title: "BTC1H",
    text: "Lecture directionnelle BTC 1h en temps reel avec orientation + ou -, confiance, rentabilite et historique horaire.",
    url: window.location.href
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      setShareStatus("Lien pret a partager.");
      return;
    }
    await navigator.clipboard.writeText(window.location.href);
    setShareStatus("Lien copie dans le presse-papiers.");
  } catch {
    setShareStatus("Partage annule.");
  }
}

function setShareStatus(message) {
  els.shareStatus.textContent = message;
  if (!message) return;
  setTimeout(() => {
    if (els.shareStatus.textContent === message) {
      els.shareStatus.textContent = "";
    }
  }, 3500);
}

function showError(error) {
  setStatus(error.message);
  log(`Erreur: ${error.message}`);
}

bindAuthEvents();
bootstrapAuth().catch((error) => setAuthStatus(error.message, "error"));
