import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const light = theme === 'light';
  const action = light ? 'تفعيل الوضع الليلي' : 'تفعيل الوضع النهاري';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={action}
      title={action}
    >
      {light ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
      <span>{light ? 'ليلي' : 'نهاري'}</span>
    </button>
  );
}
