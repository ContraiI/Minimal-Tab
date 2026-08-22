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


  // 整页翻译开关:按钮文案随状态切换
  const pageBtn = document.getElementById('pageToggleBtn');
  function renderPageBtn(enabled) {
    pageBtn.textContent = enabled ? t('popupCancelTranslate') : t('popupTranslatePage');
    pageBtn.classList.toggle('active', enabled);
  }
  chrome.storage.local.get(['pageTrans.enabled'], (r) => {
    renderPageBtn(!!r['pageTrans.enabled']);
  });
  // 点击后读写 chrome.storage 中的整页翻译开关状态
  pageBtn.addEventListener('click', () => {
    chrome.storage.local.get(['pageTrans.enabled'], (r) => {
      const next = !r['pageTrans.enabled'];
      chrome.storage.local.set({ 'pageTrans.enabled': next });
      renderPageBtn(next);
    });
  });
});
