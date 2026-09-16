document.addEventListener('DOMContentLoaded', () => {

  // 应用已保存的主题色到 CSS 变量(与 newtab、翻译边栏同一份实现,见 color-utils.js);
  // 三处口径必须一致,否则把主题色设成浅色时弹窗按钮会是白字浅底、看不清(v1.4.3 修过此处)。
  // 缺失或非法值由共享实现回落到 #2563eb,与 popup.css 自身的 --accent 默认值一致
  ColorUtils.applyAccentVars(localStorage.getItem('accentColor'));
  // 应用主题模式(系统/浅色/深色);系统深浅色判断走共享的 dom-utils.js(全项目只此一份)
  const mode = localStorage.getItem('themeMode') || 'system';
  const isDark = mode === 'system'
    ? DomUtils.getSystemDark()
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
