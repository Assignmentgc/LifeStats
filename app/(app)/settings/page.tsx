import { SettingsPanel } from "@/components/settings/settings-panel";
import { getCurrentLifeStatsSettings } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { getUserNames } from "@/lib/user-name";

export default async function SettingsPage() {
  const settings = await getCurrentLifeStatsSettings();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <main className="page-container settings-page">
    <header className="page-header"><div><p className="eyebrow">Preferences</p><h1 className="page-title">Settings</h1><p className="page-description">Control how LifeStats looks and manage your session.</p></div></header>
    <SettingsPanel settings={settings} names={getUserNames(user)} />
  </main>;
}
