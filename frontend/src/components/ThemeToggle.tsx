'use client';

import { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    // Component mounted, get the theme applied by the layout script
    const currentTheme = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null;
    if (currentTheme) {
      setTheme(currentTheme);
    } else {
      // Fallback
      setTheme('light');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  // Prevent rendering incorrect icon during SSR to avoid hydration mismatch flash
  if (theme === null) {
    return (
      <div 
        className="neo-card flex items-center justify-center rounded-full" 
        style={{ width: '40px', height: '40px', padding: 0 }} 
      />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="neo-card card-hover flex items-center justify-center rounded-full cursor-pointer transition-shadow"
      style={{ width: '40px', height: '40px', padding: 0, color: 'var(--text-primary)' }}
      aria-label="Toggle Theme"
      title="Toggle Theme"
    >
      {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  );
}
