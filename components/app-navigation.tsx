"use client";

import Link from "next/link";
import { BarChart3, BookOpenText, CircleCheckBig, Home, ListTodo, Repeat2, Settings } from "lucide-react";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/check-in", label: "Check-In", icon: CircleCheckBig },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/habits", label: "Habits", icon: Repeat2 },
  { href: "/journal", label: "Journal", icon: BookOpenText },
  { href: "/todo", label: "To-Do", icon: ListTodo },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav className="app-nav app-navigation" aria-label="Main navigation">
      {navigation.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`app-nav__link ${active ? "app-nav__link--active" : ""}`}
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
