const { detectRegions } = require('../src/core/aiVision');

function mockFetchOk(regions) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ regions }) } }]
    })
  });
}

describe('aiVision.detectRegions', () => {
  test('throws when no API key is provided', async () => {
    await expect(detectRegions('data:image/jpeg;base64,xxx', 'face', {})).rejects.toThrow(
      'OpenAI API key is required'
    );
  });

  test('resolves to the regions returned by the API', async () => {
    const regions = [{ x: 0.1, y: 0.1, width: 0.2, height: 0.2, confidence: 0.9 }];
    const fetchImpl = mockFetchOk(regions);
    const result = await detectRegions('data:image/jpeg;base64,xxx', 'face', {
      apiKey: 'sk-test',
      fetchImpl
    });
    expect(result).toEqual(regions);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(options.headers.Authorization.startsWith('Bearer ')).toBe(true);
    expect(options.headers.Authorization.endsWith('sk-test')).toBe(true);
  });

  test('throws a descriptive error when the API responds with a non-OK status', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key'
    });
    await expect(
      detectRegions('data:image/jpeg;base64,xxx', 'face', { apiKey: 'sk-bad', fetchImpl })
    ).rejects.toThrow('OpenAI Vision API error (401): invalid api key');
  });

  test('returns an empty array when the response content is malformed', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json' } }] })
    });
    const result = await detectRegions('data:image/jpeg;base64,xxx', 'face', {
      apiKey: 'sk-test',
      fetchImpl
    });
    expect(result).toEqual([]);
  });
});
