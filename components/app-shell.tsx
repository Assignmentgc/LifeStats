import Link from "next/link";
import { AppNavigation } from "@/components/app-navigation";

type AppShellProps = {
  email: string;
  children: React.ReactNode;
};

export function AppShell({ email, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link className="app-brand" href="/dashboard" aria-label="LifeStats dashboard">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <span>LifeStats</span>
        </Link>
        <div className="account-menu">
          <span className="account-email" title={email}>{email}</span>
        </div>
      </header>
      {children}
      <AppNavigation />
    </div>
  );
}
