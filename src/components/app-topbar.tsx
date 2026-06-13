import { Bell, Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

export function AppTopbar() {
  const { theme, toggle } = useTheme();
  return (
    <header className="flex h-14 items-center justify-end gap-2 border-b border-border bg-background px-4 md:px-6">
      <button
        type="button"
        aria-label="Notificações"
        className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Bell className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label="Alternar tema"
        className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" strokeWidth={1.75} /> : <Moon className="h-4 w-4" strokeWidth={1.75} />}
      </button>
    </header>
  );
}
