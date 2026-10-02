import Link from "next/link";
import { Panel } from "@/components/ui";

export default function CheckoutCancelledPage() {
  return (
    <main className="page-container">
      <Panel className="billing-card">
        <p className="eyebrow">Checkout cancelled</p>
        <h1 className="page-title">No payment was made</h1>
        <p>You can return to LifeStats now, or restart checkout whenever you&apos;re ready.</p>
        <div className="billing-card__actions">
          <Link className="button button--secondary" href="/dashboard">Return to your sheet</Link>
          <Link className="button button--primary" href="/billing">Try checkout again</Link>
        </div>
      </Panel>
    </main>
  );
}
