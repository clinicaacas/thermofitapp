import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";

export function AppShell({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <AppSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <AppTopbar />
        <main className="flex-1 p-6 md:p-8">
          {title && <h1 className="text-lg font-semibold text-foreground">{title}</h1>}
          {children}
        </main>
      </div>
    </div>
  );
}
