"use client";

import { MonitorCog, Moon, Sparkles, Sun, UserRound } from "lucide-react";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { updateLifeStatsSettings, updateProfileName } from "@/app/actions/settings";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button, Panel } from "@/components/ui";
import type { LifeStatsSettings } from "@/lib/constants";
import { MAX_NAME_LENGTH } from "@/lib/user-name";

type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("lifestats-theme", theme);
}

export function SettingsPanel({ settings: initialSettings, names }: { settings: LifeStatsSettings; names: { firstName: string; lastName: string } }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [settings, setSettings] = useState(initialSettings);
  const [isSaving, startTransition] = useTransition();
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState(names.firstName);
  const [lastName, setLastName] = useState(names.lastName);
  const [isSavingName, startNameTransition] = useTransition();
  const [nameMessage, setNameMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameMessage(null);
    startNameTransition(async () => {
      const result = await updateProfileName(firstName, lastName);
      setNameMessage(result.error ? { type: "error", text: result.error } : { type: "success", text: "Name saved." });
    });
  }

  useEffect(() => {
    const savedTheme = localStorage.getItem("lifestats-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      applyTheme(savedTheme);
    }
  }, []);

  function chooseTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  function saveSettings(next: LifeStatsSettings) {
    setSettings(next); setSettingsError(null);
    startTransition(async () => { const result = await updateLifeStatsSettings(next); if (result.error) setSettingsError(result.error); });
  }

  return <div className="settings-list">
    <Panel className="settings-card">
      <div className="settings-card__heading"><UserRound aria-hidden="true" size={19} /><div><h2>Profile</h2><p>Your name is used to address you across LifeStats.</p></div></div>
      <form className="auth-form" onSubmit={saveName}>
        <label className="field"><span className="field__label">First name</span><input autoComplete="given-name" className="input" maxLength={MAX_NAME_LENGTH} onChange={(event) => setFirstName(event.target.value)} required type="text" value={firstName} /></label>
        <label className="field"><span className="field__label">Last name</span><input autoComplete="family-name" className="input" maxLength={MAX_NAME_LENGTH} onChange={(event) => setLastName(event.target.value)} required type="text" value={lastName} /></label>
        {nameMessage ? <p className={`form-message form-message--${nameMessage.type}`}>{nameMessage.text}</p> : null}
        <Button loading={isSavingName} loadingText="Saving…" type="submit" variant="primary">Save name</Button>
      </form>
    </Panel>
    <Panel className="settings-card">
      <div className="settings-card__heading"><MonitorCog aria-hidden="true" size={19} /><div><h2>Appearance</h2><p>Choose the color mode that feels best to you.</p></div></div>
      <div className="appearance-options" role="group" aria-label="Appearance mode">
        <button aria-pressed={theme === "dark"} className={theme === "dark" ? "appearance-option appearance-option--selected" : "appearance-option"} onClick={() => chooseTheme("dark")} type="button"><Moon aria-hidden="true" size={17} />Dark mode</button>
        <button aria-pressed={theme === "light"} className={theme === "light" ? "appearance-option appearance-option--selected" : "appearance-option"} onClick={() => chooseTheme("light")} type="button"><Sun aria-hidden="true" size={17} />Light mode</button>
      </div>
    </Panel>
    <Panel className="settings-card">
      <div className="settings-card__heading"><Sparkles aria-hidden="true" size={19} /><div><h2>Spirituality</h2><p>Track Spirituality as an optional Environment substat.</p></div></div>
      <label className="daily-toggle"><input checked={settings.spiritualityEnabled} disabled={isSaving} onChange={(event) => saveSettings({ spiritualityEnabled: event.target.checked, includeSpiritualityInLifeScore: event.target.checked && settings.includeSpiritualityInLifeScore })} type="checkbox" /><span><strong>Spirituality tracking</strong><small>Show and score Spirituality under Environment.</small></span></label>
      <label className="daily-toggle"><input checked={settings.includeSpiritualityInLifeScore} disabled={!settings.spiritualityEnabled || isSaving} onChange={(event) => saveSettings({ ...settings, includeSpiritualityInLifeScore: event.target.checked })} type="checkbox" /><span><strong>Include Spirituality in LifeScore</strong><small>When enabled, LifeScore reserves 10% for Spirituality and proportionally scales the six Base Stat weights.</small></span></label>
      {settingsError ? <p className="form-message form-message--error">{settingsError}</p> : null}
    </Panel>
    <Panel className="settings-card settings-card--logout">
      <div className="settings-card__heading"><div><h2>Log out</h2><p>End this session on this device.</p></div><SignOutButton /></div>
    </Panel>
  </div>;
}
