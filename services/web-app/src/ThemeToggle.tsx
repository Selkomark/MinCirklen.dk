import { useTheme } from './components/ThemeProvider'
import { IconButton } from './components/IconButton'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return <IconButton icon={theme === 'dark' ? '☀' : '☾'} label="Toggle theme" onClick={toggleTheme} />
}
