/**
 * Wraps chrome.storage.local access for user-controlled settings:
 * API key, per-site enable/disable, and processing preferences. All
 * permissions default to OFF until the user explicitly enables them via
 * the popup, per the "permission สิ้นสุดอยู่ที่เราสั่ง" requirement.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  root.AIBotPermissions = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  const STORAGE_KEY = 'aiBotSettings';

  const DEFAULT_SETTINGS = {
    apiKey: '',
    enabledSites: {
      facebook: false,
      tiktok: false,
      instagram: false
    },
    autoProcess: false
  };

  function getStorageArea() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    return null;
  }

  function getSettings() {
    const area = getStorageArea();
    if (!area) {
      return Promise.resolve({ ...DEFAULT_SETTINGS });
    }
    return new Promise((resolve) => {
      area.get([STORAGE_KEY], (result) => {
        const stored = (result && result[STORAGE_KEY]) || {};
        resolve({
          ...DEFAULT_SETTINGS,
          ...stored,
          enabledSites: { ...DEFAULT_SETTINGS.enabledSites, ...(stored.enabledSites || {}) }
        });
      });
    });
  }

  function saveSettings(partialSettings) {
    const area = getStorageArea();
    return getSettings().then((current) => {
      const merged = {
        ...current,
        ...partialSettings,
        enabledSites: { ...current.enabledSites, ...(partialSettings.enabledSites || {}) }
      };
      if (!area) {
        return merged;
      }
      return new Promise((resolve) => {
        area.set({ [STORAGE_KEY]: merged }, () => resolve(merged));
      });
    });
  }

  function isSiteEnabled(settings, site) {
    return Boolean(settings && settings.enabledSites && settings.enabledSites[site]);
  }

  return { DEFAULT_SETTINGS, getSettings, saveSettings, isSiteEnabled, STORAGE_KEY };
});
