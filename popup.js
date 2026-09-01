document.addEventListener('DOMContentLoaded', () => {

  // 应用已保存的主题色到 CSS 变量
  const accent = localStorage.getItem('accentColor');
  if (/^#[0-9a-fA-F]{6}$/.test(accent)) {
    const r = parseInt(accent.slice(1, 3), 16);
    const g = parseInt(accent.slice(3, 5), 16);
    const b = parseInt(accent.slice(5, 7), 16);
    document.body.style.setProperty('--accent', accent);
    document.body.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  }
  // 应用主题模式(系统/浅色/深色)
  const mode = localStorage.getItem('themeMode') || 'system';
  const isDark = mode === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : mode === 'dark';
  document.body.classList.toggle('light', !isDark);

  // 点击后打开翻译侧边栏并关闭弹窗
  const btn = document.getElementById('openPanelBtn');
  btn.addEventListener('click', async () => {
    try {
      const win = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: win.id });
      window.close();
    } catch (err) {
      console.error('打开翻译边栏失败', err);
    }
  });


  // 整页翻译开关:按当前标签页查询/切换(per-tab,不全局联动)
  const pageBtn = document.getElementById('pageToggleBtn');
  function renderPageBtn(enabled) {
    pageBtn.textContent = enabled ? t('popupCancelTranslate') : t('popupTranslatePage');
    pageBtn.classList.toggle('active', enabled);
  }
  async function currentTabId() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0].id : null;
  }
  async function queryState(tabId) {
    if (tabId == null) return false;
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'PAGE_TRANSLATE_QUERY', tabId });
      return !!(resp && resp.enabled);
    } catch (err) { return false; }
  }
  let stateSeq = 0;
  async function refreshPageBtn() {
    const id = ++stateSeq;
    try {
      const tabId = await currentTabId();
      const enabled = await queryState(tabId);
      if (id === stateSeq) renderPageBtn(enabled);
    } catch (err) {
      if (id === stateSeq) renderPageBtn(false);
    }
  }
  refreshPageBtn();
  pageBtn.addEventListener('click', async () => {
    const id = ++stateSeq;
    try {
      const tabId = await currentTabId();
      if (tabId == null) return;
      const resp = await chrome.runtime.sendMessage({ type: 'PAGE_TRANSLATE_TOGGLE', tabId });
      if (id === stateSeq) renderPageBtn(!!(resp && resp.enabled));
    } catch (err) {}
  });

  // 其它标签页切换插件语言时,实时刷新弹窗文案
  window.addEventListener('storage', (e) => {
    if (e.key === 'language') {
      setLanguage(e.newValue || 'zh-CN');
      refreshPageBtn();
    }
  });
});
