const state = {
  candles: [],
  liveTimer: null,
  market: null,
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
const HOURLY_HYPOTHESIS_STORAGE_KEY = "btc-signal-engine-hourly-hypotheses";
const NEUTRAL_STRENGTH_THRESHOLD = 0.32;

const els = {
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

async function fetchBinanceCandles() {
  if (state.quotaLocked) return;
  setStatus("Chargement des donnees BTC...");
  const url = "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=1000";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Binance a repondu ${response.status}`);
  const rows = await response.json();
  state.candles = rows.map((row) => ({
    time: row[0],
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5])
  }));
  setStatus(`BTC actualise: ${new Date().toLocaleTimeString("fr-FR")}`);
  analyze();
  refreshStudyDatabase().catch(() => null);
}

async function loadMarketFromUrl() {
  const raw = els.marketUrlInput.value.trim();
  if (!raw) throw new Error("Colle une URL ou un slug Polymarket.");
  const slug = extractSlug(raw);
  setStatus("Lecture du creneau Polymarket...");
  const market = await fetchMarketOrEvent(slug);
  state.market = market;
  const minutes = inferMinutesLeft(market);
  if (minutes) {
    const nearest = [15, 30, 45, 60].reduce((best, value) => (
      Math.abs(value - minutes) < Math.abs(best - minutes) ? value : best
    ), 60);
    els.horizonInput.value = String(nearest);
  }
  els.marketQuestion.textContent = market.question || market.title || market.slug || "Creneau charge.";
  log(`Creneau lu: ${els.marketQuestion.textContent}`);
  analyze();
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
  const backtest = buildHourlyBacktest(state.candles, settings, 12);
  const confidence = calibrateConfidence(rawConfidence, backtest, direction);
  const hourlyClose = buildHourlyCloseModel(state.candles, model, spot, settings, backtest);
  const remoteReference = buildRemoteOpeningReference(state.candles, spot);
  const hourlyReference = remoteReference || buildOpeningHourReference(state.candles, settings, backtest) || hourlyClose;
  const slotForecasts = buildSlotForecasts(spot, model, settings);
  const hourlyHypothesis = remoteReference
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

  renderMetrics({ spot, forecast, delta, deltaPct, confidence, direction, settings, model, hourlyHypothesis });
  renderPlainSummary({ spot, forecast, delta, deltaPct, confidence, direction, settings, model, slotForecasts, hourlyClose: hourlyReference });
  renderHypotheses({ spot, forecast, delta, confidence, direction, slotForecasts, hourlyHypothesis, hourlyClose, hourlyReference });
  renderHourlyCloseModel(hourlyReference);
  renderSignals({ direction, confidence, settings, model });
  renderSlots({ spot, model, settings, slotForecasts });
  renderStudyNotes({ spot, forecast, delta, direction, confidence, settings, model, slotForecasts });
  renderHourlyHistory(buildHourlyHistory(state.candles, 10));
  renderSupervision({ backtest, rawConfidence, confidence, direction });
  renderChart({ forecast, spot });
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

function buildHourlyBacktest(candles, settings, limit) {
  const completedHours = buildHourlyHistory(candles, limit).reverse();
  const rows = [];
  completedHours.forEach((hour) => {
    const openIndex = candles.findIndex((candle) => candle.time >= hour.bucket);
    if (openIndex < 240) return;
    const openingCandle = candles[openIndex];
    const referenceCandles = candles.slice(0, openIndex + 1);
    referenceCandles[referenceCandles.length - 1] = {
      ...openingCandle,
      high: hour.open,
      low: hour.open,
      close: hour.open
    };
    const closes = referenceCandles.map((candle) => candle.close);
    const returns = closes.slice(1).map((close, index) => Math.log(close / closes[index]));
    const hourlySettings = { ...settings, horizon: 60 };
    const model = buildModel(referenceCandles, closes, returns, hourlySettings, false);
    const replay = buildHourlyCloseModel(referenceCandles, model, hour.open, hourlySettings, null);
    const forecast = replay.closePrice;
    const predicted = replay.direction;
    const actual = hour.close >= hour.open ? "+" : "-";
    const confidence = replay.confidence;
    rows.push({
      bucket: hour.bucket,
      predicted,
      actual,
      confidence,
      deltaPct: hour.deltaPct,
      errorPct: Math.abs(forecast / Math.max(hour.close, 0.000001) - 1),
      correct: predicted === "~" ? null : predicted === actual
    });
  });

  const attempted = rows.filter((row) => row.correct !== null);
  const wins = attempted.filter((row) => row.correct).length;
  const neutral = rows.filter((row) => row.predicted === "~").length;
  return {
    rows,
    attempted: attempted.length,
    wins,
    neutral,
    accuracy: attempted.length ? wins / attempted.length : null,
    averageError: rows.length ? mean(rows.map((row) => row.errorPct)) : null
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
  const reliability = backtest && backtest.accuracy !== null ? clamp(0.72 + (backtest.accuracy - 0.5) * 0.55, 0.58, 1.08) : 0.82;

  const score =
    livePressure * 0.25 +
    distanceScore * 0.28 +
    rangeScore * 0.14 +
    recentBias * 0.13 +
    recentContinuation * 0.08 +
    lateLock * 0.12;
  const remainingScale = Math.sqrt(Math.max(remaining, 1) / 60);
  const closeReturnFromNow = clamp(score * hourNoise * remainingScale * 0.85, -hourNoise * 1.35, hourNoise * 1.35);
  const closePrice = spot * Math.exp(closeReturnFromNow);
  const edgeFromOpen = closePrice / open - 1;
  const strength = Math.abs(edgeFromOpen) / Math.max(hourNoise * settings.sensitivity, 0.000001);
  const direction = strength < NEUTRAL_STRENGTH_THRESHOLD ? "~" : closePrice >= open ? "+" : "-";
  const confidence = direction === "~"
    ? Math.min(0.32, strength * 0.45)
    : clamp((strength / 2) * volatilityPenalty * reliability, 0.05, 0.92);

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

function buildOpeningHourReference(candles, settings, backtest) {
  const bucket = hourStart(candles.at(-1).time);
  const openIndex = candles.findIndex((candle) => candle.time >= bucket);
  if (openIndex < 240) return null;
  const openingCandle = candles[openIndex];
  const open = openingCandle.open;
  const referenceCandles = candles.slice(0, openIndex + 1);
  referenceCandles[referenceCandles.length - 1] = {
    ...openingCandle,
    high: open,
    low: open,
    close: open
  };
  const closes = referenceCandles.map((candle) => candle.close);
  const returns = closes.slice(1).map((close, index) => Math.log(close / closes[index]));
  const hourlySettings = { ...settings, horizon: 60 };
  const openingModel = buildModel(referenceCandles, closes, returns, hourlySettings, false);
  const reference = buildHourlyCloseModel(referenceCandles, openingModel, open, hourlySettings, backtest);
  return {
    ...reference,
    capturedAt: bucket,
    isOpeningReference: true
  };
}

function buildRemoteOpeningReference(candles, spot) {
  if (!state.studyObservations.length) return null;
  const bucket = hourStart(candles.at(-1).time);
  const row = state.studyObservations.find((observation) => Date.parse(observation.hour_open) === bucket);
  if (!row) return null;
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
  const shouldCapture = !hypotheses[key] || (closeModel?.isOpeningReference && hypotheses[key].model !== "opening-reference");
  if (shouldCapture && (closeModel || finHour)) {
    hypotheses[key] = {
      bucket,
      capturedAt: closeModel?.capturedAt || now,
      startPrice: closeModel ? closeModel.open : result.spot,
      forecastPrice: closeModel ? closeModel.closePrice : finHour.price,
      forecastDelta: closeModel ? closeModel.closePrice - closeModel.open : finHour.delta,
      direction: closeModel ? closeModel.direction : finHour.direction,
      confidence: closeModel ? closeModel.confidence : result.confidence,
      model: closeModel?.isOpeningReference ? "opening-reference" : closeModel ? "hourly-close" : "live-projection"
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
  els.signalCard.className = `hero-signal ${directionClass(result.direction)}`;
  els.directionValue.textContent = result.direction;
  els.directionText.textContent = result.direction === "+"
    ? "Scenario principal : BTC plus haut"
    : result.direction === "-"
      ? "Scenario principal : BTC plus bas"
      : "Scenario principal : zone neutre";
  els.directionContext.textContent = `${fmtDelta.format(result.delta)} estime sur ${result.settings.horizon} min. Regime ${result.model.regime.label}.`;
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
  const confidenceLabel = result.confidence > 0.65 ? "bonne" : result.confidence > 0.35 ? "moyenne" : "faible";
  const nextHour = result.slotForecasts.find((slot) => slot.label === "Fin heure courante");
  const nextText = nextHour
    ? `Fin d'heure estimee: ${nextHour.direction} vers ${fmtUsd.format(nextHour.price)}.`
    : "Fin d'heure non disponible.";
  const hourlyText = result.hourlyClose
    ? `Modele horaire: ${result.hourlyClose.direction} a ${Math.round(result.hourlyClose.confidence * 100)}%, cloture estimee ${fmtUsd.format(result.hourlyClose.closePrice)} contre ouverture ${fmtUsd.format(result.hourlyClose.open)}.`
    : "";
  const caution = result.model.regime.label === "volatil"
    ? "Marche volatil: le signal peut changer vite."
    : Math.abs(result.delta) < result.model.atrValue * 0.4
      ? "Ecart faible: le bruit peut dominer."
      : "Lecture exploitable, a surveiller avec les clotures.";
  els.plainSummary.innerHTML = `
    <p><strong>${result.direction === "+" ? "Plutot haussier" : result.direction === "-" ? "Plutot baissier" : "Neutre"}</strong> avec une confiance ${confidenceLabel}.</p>
    <p>${nextText}</p>
    <p>${hourlyText}</p>
    <p>${caution}</p>
  `;
}

function renderHypotheses(result) {
  els.liveHypothesisCard.className = `hypothesis-card ${directionClass(result.direction)}`;
  els.liveHypothesisValue.textContent = `${result.direction} ${Math.round(result.confidence * 100)}%`;
  els.liveHypothesisContext.textContent = `Cap live ${fmtUsd.format(result.forecast)} (${fmtDelta.format(result.delta)}). Cote indicative ${formatDecimalOdds(result.confidence, result.direction)}.`;

  const fixed = result.hourlyHypothesis;
  if (!fixed) {
    els.fixedHypothesisCard.className = "hypothesis-card";
    els.fixedHypothesisValue.textContent = "--";
    els.fixedHypothesisContext.textContent = "En attente de capture horaire.";
    return;
  }
  els.fixedHypothesisCard.className = `hypothesis-card ${directionClass(fixed.direction)}`;
  els.fixedHypothesisValue.textContent = `${fixed.direction} ${Math.round(fixed.confidence * 100)}%`;
  els.fixedHypothesisContext.textContent = `Repere garde pour juger l'heure: ouverture ${fmtTime.format(new Date(fixed.capturedAt))}, cloture estimee ${fmtUsd.format(fixed.forecastPrice)}.`;
}

function formatDecimalOdds(confidence, direction) {
  if (direction === "~" || confidence <= 0) return "--";
  return `x${(1 / clamp(confidence, 0.05, 0.95)).toFixed(2)}`;
}

function renderHourlyCloseModel(hourlyClose) {
  if (!els.hourlyCloseCard || !hourlyClose) return;
  els.hourlyCloseCard.className = `hourly-close-main ${directionClass(hourlyClose.direction)}`;
  els.hourlyCloseValue.textContent = `${hourlyClose.direction} ${Math.round(hourlyClose.confidence * 100)}%`;
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
    const node = document.createElement("article");
    node.className = `slot-card ${directionClass(slot.direction)}`;
    node.innerHTML = `
      <span>${slot.label}</span>
      <strong>${slot.direction} ${fmtUsd.format(slot.price)}</strong>
      <small>${slot.detail} | ${fmtDelta.format(slot.delta)}</small>
    `;
    els.slotGrid.appendChild(node);
  });
}

function renderStudyNotes(result) {
  const model = result.model;
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
        ? "Pas de biais clair : le moteur attend une meilleure separation entre signal et bruit."
        : `Le biais ${result.direction} devient fragile autour de ${fmtUsd.format(invalidation)} si le prix s'y installe.`
    },
    {
      title: "Heure suivante",
      text: nextSlot ? `Projection ${nextSlot.direction} vers ${fmtUsd.format(nextSlot.price)}, soit ${fmtDelta.format(nextSlot.delta)} depuis maintenant.` : "Projection indisponible."
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
  if (!force && state.studyObservations.length && Date.now() - state.lastStudyFetch < 60000) return;
  els.databaseStatus.textContent = "Synchronisation...";
  els.databaseStatus.className = "database-status is-syncing";
  const fields = [
    "hour_open", "prediction_origin", "model_version", "opening_price", "predicted_close",
    "predicted_direction", "calibrated_confidence", "regime", "actual_close",
    "actual_direction", "verdict", "absolute_error_pct"
  ].join(",");
  const requestHeaders = { apikey: key };
  if (key.startsWith("eyJ")) {
    requestHeaders.Authorization = `Bearer ${key}`;
  }
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

  const judged = rows.filter((row) => row.verdict === "correct" || row.verdict === "wrong");
  const live = rows.filter((row) => row.prediction_origin === "live");
  const replay = rows.filter((row) => row.prediction_origin === "replay");
  const neutral = rows.filter((row) => row.verdict === "neutral");
  const pending = rows.filter((row) => row.verdict === "pending");
  const totalCount = Number(summary?.total) || rows.length;
  const liveCount = Number(summary?.live_total) || live.length;
  const replayCount = Number(summary?.replay_total) || replay.length;
  const judgedCount = Number(summary?.judged_total) || judged.length;
  const winsCount = Number(summary?.wins_total) || judged.filter((row) => row.verdict === "correct").length;
  const liveJudgedCount = Number(summary?.live_judged_total) || live.filter((row) => row.verdict === "correct" || row.verdict === "wrong").length;
  const liveWinsCount = Number(summary?.live_wins_total) || live.filter((row) => row.verdict === "correct").length;
  const neutralCount = Number(summary?.neutral_total) || neutral.length;
  const pendingCount = Number(summary?.pending_total) || pending.length;
  const accuracy = judgedCount ? winsCount / judgedCount : null;
  const liveAccuracy = liveJudgedCount ? liveWinsCount / liveJudgedCount : null;
  const averageError = summary?.average_error_pct === null || summary?.average_error_pct === undefined
    ? (judged.length ? mean(judged.map((row) => Number(row.absolute_error_pct) || 0)) : null)
    : Number(summary.average_error_pct);
  const last24Count = Number(summary?.last_24h_total) || rows.filter((row) => Date.parse(row.hour_open) >= Date.now() - 24 * 3600000).length;

  const regimes = ["directionnel", "volatil", "calme", "neutre"]
    .map((regime) => studyBar(`Regime ${regime}`, rows.filter((row) => row.regime === regime)))
    .join("");
  const confidenceBands = [
    { label: "Confiance < 35%", min: 0, max: 0.35 },
    { label: "Confiance 35-55%", min: 0.35, max: 0.55 },
    { label: "Confiance 55-75%", min: 0.55, max: 0.75 },
    { label: "Confiance > 75%", min: 0.75, max: 1.01 }
  ].map((band) => studyBar(
    band.label,
    rows.filter((row) => Number(row.calibrated_confidence) >= band.min && Number(row.calibrated_confidence) < band.max)
  )).join("");

  const timeline = rows.slice(0, 18).map((row) => {
    const date = new Date(row.hour_open);
    const verdictLabel = row.verdict === "correct" ? "juste" : row.verdict === "wrong" ? "faux" : row.verdict === "neutral" ? "neutre" : "en cours";
    return `
      <article class="study-timeline-item ${directionClass(row.predicted_direction)} verdict-${row.verdict}">
        <span>${date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} · ${fmtTime.format(date)}</span>
        <strong>${row.predicted_direction} ${Math.round(Number(row.calibrated_confidence) * 100)}%</strong>
        <small>${verdictLabel} · ${row.prediction_origin === "live" ? "reel" : "rejeu"} · ${row.regime}</small>
      </article>
    `;
  }).join("");

  els.studyDatabase.innerHTML = `
    <section class="study-kpis">
      <article><span>Heures memorisees</span><strong>${totalCount}</strong><small>${liveCount} reelles · ${replayCount} rejouees</small></article>
      <article><span>Reussite globale</span><strong>${accuracy === null ? "--" : `${Math.round(accuracy * 100)}%`}</strong><small>${judgedCount} decisions tranchees</small></article>
      <article><span>Reussite live</span><strong>${liveAccuracy === null ? "--" : `${Math.round(liveAccuracy * 100)}%`}</strong><small>predictions faites avant le resultat</small></article>
      <article><span>Erreur prix moyenne</span><strong>${averageError === null ? "--" : fmtPct.format(averageError)}</strong><small>projection fixe contre cloture</small></article>
      <article><span>Dernieres 24 h</span><strong>${last24Count}</strong><small>observations disponibles</small></article>
      <article><span>Etats non tranches</span><strong>${neutralCount + pendingCount}</strong><small>${neutralCount} neutres · ${pendingCount} en cours</small></article>
    </section>
    <section class="study-breakdowns">
      <div><h3>Precision par regime</h3>${regimes}</div>
      <div><h3>Calibration par confiance</h3>${confidenceBands}</div>
    </section>
    <section class="study-timeline-wrap">
      <h3>Dernieres estimations fixes</h3>
      <div class="study-timeline">${timeline}</div>
    </section>
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
    const verdict = row.correct === null ? "neutre" : row.correct ? "juste" : "faux";
    return `
      <article class="supervision-row ${directionClass(row.predicted)}">
        <span>${fmtTime.format(new Date(row.bucket))}</span>
        <strong>${row.predicted} -> ${row.actual}</strong>
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
    const verdict = fixed ? (fixed.direction === "~" ? "neutre" : fixed.direction === hour.direction ? "juste" : "faux") : "non capturee";
    const node = document.createElement("article");
    node.className = `history-card ${directionClass(hour.direction)}`;
    node.innerHTML = `
      <span>${fmtTime.format(start)}-${fmtTime.format(end)}</span>
      <strong>${hour.direction} ${fmtPct.format(hour.deltaPct)}</strong>
      <small>O ${fmtUsd.format(hour.open)} | C ${fmtUsd.format(hour.close)}</small>
      <small>Range ${fmtPct.format(hour.rangePct)} | ${hour.complete} min</small>
      <small>Hypothese fixe : ${fixed ? fixed.direction : "--"} ${verdict}</small>
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
    fetchBinanceCandles().catch(showError);
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
  els.shareBtn.addEventListener("click", shareApp);
  els.rewardAdBtn.addEventListener("click", grantRewardTime);
  els.overlayRewardAdBtn.addEventListener("click", grantRewardTime);
  els.refreshBtn.addEventListener("click", () => fetchBinanceCandles().catch(showError));
  els.loadMarketBtn.addEventListener("click", () => loadMarketFromUrl().catch(showError));
  els.liveToggle.addEventListener("change", restartLiveTimer);
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
  fetchBinanceCandles().catch(showError);
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
    text: "Lecture directionnelle BTC 1h en temps reel avec signal + / - / ~, creneaux, indicateurs et historique horaire.",
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

bindEvents();
startQuotaTimer();
restartLiveTimer();
refreshStudyDatabase(true).catch(() => null);
fetchBinanceCandles().catch(showError);
