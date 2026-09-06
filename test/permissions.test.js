const { DEFAULT_SETTINGS, getSettings, saveSettings, isSiteEnabled } = require('../src/core/permissions');

describe('permissions (no chrome.storage available - Node fallback)', () => {
  test('getSettings returns defaults when chrome.storage is unavailable', async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  test('saveSettings merges partial settings without persisting (fallback mode)', async () => {
    const merged = await saveSettings({ apiKey: 'sk-test', enabledSites: { facebook: true } });
    expect(merged.apiKey).toBe('sk-test');
    expect(merged.enabledSites).toEqual({ facebook: true, tiktok: false, instagram: false });
  });

  test('isSiteEnabled checks the enabledSites map safely', () => {
    expect(isSiteEnabled({ enabledSites: { facebook: true } }, 'facebook')).toBe(true);
    expect(isSiteEnabled({ enabledSites: { facebook: false } }, 'facebook')).toBe(false);
    expect(isSiteEnabled(null, 'facebook')).toBe(false);
    expect(isSiteEnabled({}, 'facebook')).toBe(false);
  });
});
