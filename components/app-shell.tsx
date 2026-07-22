import Link from "next/link";
import { BookOpenText, ClipboardList, LayoutDashboard, Swords } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";

const navigation = [
  { href: "/dashboard", label: "Sheet", icon: LayoutDashboard },
  { href: "/quests", label: "Quests", icon: Swords },
  { href: "/habits", label: "Habits", icon: ClipboardList },
  { href: "/journal", label: "Journal", icon: BookOpenText },
];

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
        <nav className="app-nav" aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} className="app-nav__link" href={href}>
              <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="account-menu">
          <span className="account-email" title={email}>{email}</span>
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
