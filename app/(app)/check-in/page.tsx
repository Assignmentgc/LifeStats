import { CheckInForm } from "@/components/check-in/check-in-form";

export default function CheckInPage() {
  return (
    <main className="page-container check-in-page">
      <header className="check-in-page__header">
        <p className="eyebrow">Daily Check-In</p>
        <h1 className="page-title">Tell me about your day.</h1>
        <p className="page-description">
          Share what you did, how it felt, and what you learned. Your AI guide will turn the details into thoughtful updates to your character stats.
        </p>
      </header>
      <CheckInForm />
    </main>
  );
}
