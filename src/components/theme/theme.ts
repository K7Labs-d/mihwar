export const THEME_STORAGE_KEY = 'mihwar-theme';
export type Theme = 'dark' | 'light';

// Preserve the original night design unless the person has chosen day mode.
export function resolveTheme(value: string | null | undefined): Theme {
  return value === 'light' ? 'light' : 'dark';
}

export function readTheme(): Theme {
  try {
    return resolveTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', theme === 'light' ? '#f5f1e8' : '#080b0e',
  );
}

export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing or unavailable storage must not disable the toggle.
  }
}
