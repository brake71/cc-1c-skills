// Default config for tests/web-test. CLI URL still overrides defaultContext URL.
// Two contexts pointing at the same webtest publication — represent two independent
// 1C sessions (different cookies), used by multi-context tests to simulate two users.
export default {
  contexts: {
    a: { url: 'http://localhost:8081/webtest/ru_RU' },
    b: { url: 'http://localhost:8081/webtest/ru_RU' },
  },
  defaultContext: 'a',
  // isolation: 'tab' (default) — persistent context, tabs in one window, 1С extension loads.
  //   Cookies are shared between tabs but scope by URL path, so different vrd-publications
  //   give independent auth without extra isolation.
  // isolation: 'window' — separate BrowserContext per slot, full cookie isolation,
  //   extension may not load (Playwright limitation). Use only when really needed.
  timeout: 60000,
};
