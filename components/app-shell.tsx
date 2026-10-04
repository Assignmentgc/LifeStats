import Link from "next/link";
import { AppNavigation } from "@/components/app-navigation";
import { BrandMark } from "@/components/brand-mark";

type AppShellProps = {
  email: string;
  name?: string | null;
  children: React.ReactNode;
};

export function AppShell({ email, name, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link className="app-brand" href="/dashboard" aria-label="LifeStats dashboard">
          <span className="app-brand__mark">
            <BrandMark />
          </span>
          <span>LifeStats</span>
        </Link>
        <div className="account-menu">
          <span className="account-email" title={email}>{name || email}</span>
        </div>
      </header>
      {children}
      <AppNavigation />
    </div>
  );
}
