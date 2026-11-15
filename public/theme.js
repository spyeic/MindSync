try {
  const theme = localStorage.getItem('mindsync-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Use the system color scheme when storage is unavailable.
}
