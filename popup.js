document.addEventListener('DOMContentLoaded', () => {
  // 样式跟随：主题色 + 深浅模式
  const accent = localStorage.getItem('accentColor');
  if (/^#[0-9a-fA-F]{6}$/.test(accent)) {
    const r = parseInt(accent.slice(1, 3), 16);
    const g = parseInt(accent.slice(3, 5), 16);
    const b = parseInt(accent.slice(5, 7), 16);
    document.body.style.setProperty('--accent', accent);
    document.body.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  }
  const mode = localStorage.getItem('themeMode') || 'system';
  const isDark = mode === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : mode === 'dark';
  document.body.classList.toggle('light', !isDark);

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
});
