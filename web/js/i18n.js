const STORAGE_KEY = "mountainscope.lang";

const STRINGS = {
  en: {
    appTagline: "Point your camera at a mountain range to see what you're looking at.",
    startScanning: "Start scanning",
    requestingAccess: "Requesting access…",
    accessError: "Couldn't get camera/location access. Check your browser's site settings and try again.",
    searchRadiusLabel: "Search radius",
    tabScan: "Scan",
    tabPeaks: "Peaks",
    tabSettings: "Settings",
    peaksTitle: "Peaks",
    searchPlaceholder: "Search peaks by name",
    waitingForLocation: "Waiting for location…",
    noPeaksFound: "No peaks found",
    settingsTitle: "Settings",
    unitsHeading: "Units",
    unitMetric: "Metric (m, km)",
    unitImperial: "Imperial (ft, mi)",
    languageHeading: "Language",
    languageEnglish: "English",
    languageGerman: "Deutsch",
    dataHeading: "Data",
    dataAttributionPrefix: "Peak data ©",
    dataAttributionSuffix: "contributors, available under the Open Database License (ODbL).",
    aboutHeading: "About",
    versionLabel: "Version",
    done: "Done",
    elevation: "Elevation",
    prominence: "Prominence",
    distance: "Distance",
    bearing: "Bearing",
    hikingTime: "Hiking time",
    hikingTimeEstimateSuffix: "(estimated, straight-line)",
    latitude: "Latitude",
    longitude: "Longitude",
    weather: "Weather",
    weatherUnavailable: "Unavailable (no signal?)",
    nearestHut: "Nearest hut",
    nearestWater: "Nearest water source",
    nearestParking: "Nearest parking",
    away: "away",
    kindHut: "Hut",
    kindSpring: "Water source",
    kindParking: "Parking",
    kindDefault: "Point of interest",
  },
  de: {
    appTagline: "Richte deine Kamera auf ein Gebirge, um zu sehen, was du vor dir hast.",
    startScanning: "Scannen starten",
    requestingAccess: "Zugriff wird angefragt…",
    accessError: "Kamera-/Standortzugriff nicht möglich. Überprüfe die Website-Einstellungen deines Browsers und versuche es erneut.",
    searchRadiusLabel: "Suchradius",
    tabScan: "Scannen",
    tabPeaks: "Gipfel",
    tabSettings: "Einstellungen",
    peaksTitle: "Gipfel",
    searchPlaceholder: "Gipfel nach Namen suchen",
    waitingForLocation: "Warte auf Standort…",
    noPeaksFound: "Keine Gipfel gefunden",
    settingsTitle: "Einstellungen",
    unitsHeading: "Einheiten",
    unitMetric: "Metrisch (m, km)",
    unitImperial: "Imperial (ft, mi)",
    languageHeading: "Sprache",
    languageEnglish: "English",
    languageGerman: "Deutsch",
    dataHeading: "Daten",
    dataAttributionPrefix: "Gipfeldaten ©",
    dataAttributionSuffix: "Mitwirkende, verfügbar unter der Open Database License (ODbL).",
    aboutHeading: "Über",
    versionLabel: "Version",
    done: "Fertig",
    elevation: "Höhe",
    prominence: "Schartenhöhe",
    distance: "Entfernung",
    bearing: "Richtung",
    hikingTime: "Wanderzeit",
    hikingTimeEstimateSuffix: "(geschätzt, Luftlinie)",
    latitude: "Breite",
    longitude: "Länge",
    weather: "Wetter",
    weatherUnavailable: "Nicht verfügbar (kein Empfang?)",
    nearestHut: "Nächste Hütte",
    nearestWater: "Nächste Wasserquelle",
    nearestParking: "Nächster Parkplatz",
    away: "entfernt",
    kindHut: "Hütte",
    kindSpring: "Wasserquelle",
    kindParking: "Parkplatz",
    kindDefault: "Sehenswürdigkeit",
  },
};

// WMO weather codes from Open-Meteo (see web/js/weather.js) — kept here rather than in
// weather.js so all display text lives in one place.
const WEATHER_DESCRIPTIONS = {
  en: {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Heavy freezing rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
  },
  de: {
    0: "Klarer Himmel", 1: "Überwiegend klar", 2: "Teilweise bewölkt", 3: "Bedeckt",
    45: "Nebel", 48: "Reifnebel",
    51: "Leichter Nieselregen", 53: "Mäßiger Nieselregen", 55: "Starker Nieselregen",
    61: "Leichter Regen", 63: "Mäßiger Regen", 65: "Starker Regen",
    66: "Gefrierender Regen", 67: "Starker gefrierender Regen",
    71: "Leichter Schneefall", 73: "Mäßiger Schneefall", 75: "Starker Schneefall", 77: "Schneegriesel",
    80: "Leichte Regenschauer", 81: "Mäßige Regenschauer", 82: "Heftige Regenschauer",
    85: "Leichte Schneeschauer", 86: "Starke Schneeschauer",
    95: "Gewitter", 96: "Gewitter mit Hagel", 99: "Gewitter mit starkem Hagel",
  },
};

const COMPASS_DIRECTIONS = {
  // German uses O (Ost) instead of E (East) — not just a translation, a different letter.
  en: ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"],
  de: ["N", "NNO", "NO", "ONO", "O", "OSO", "SO", "SSO", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"],
};

let currentLang = loadLanguage();

function loadLanguage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "de" || stored === "en") return stored;
  // No preference saved yet: default to German if the browser is set to German (this
  // app's first real dataset is Austria-focused), English otherwise.
  return navigator.language?.toLowerCase().startsWith("de") ? "de" : "en";
}

export function getCurrentLanguage() {
  return currentLang;
}

export function setCurrentLanguage(lang) {
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
}

export function t(key) {
  return STRINGS[currentLang]?.[key] ?? STRINGS.en[key] ?? key;
}

export function weatherDescription(code) {
  return WEATHER_DESCRIPTIONS[currentLang]?.[code] ?? WEATHER_DESCRIPTIONS.en[code] ?? WEATHER_DESCRIPTIONS.en[0];
}

export function compassAbbreviation(bearingDegrees) {
  const dirs = COMPASS_DIRECTIONS[currentLang] ?? COMPASS_DIRECTIONS.en;
  const index = Math.round(bearingDegrees / 22.5) % dirs.length;
  return dirs[index];
}
