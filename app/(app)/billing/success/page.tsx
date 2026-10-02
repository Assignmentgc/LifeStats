import Link from "next/link";
import { Panel } from "@/components/ui";

export default function CheckoutSuccessPage() {
  return (
    <main className="page-container">
      <Panel className="billing-card">
        <p className="eyebrow">Payment submitted</p>
        <h1 className="page-title">We&apos;re confirming your payment</h1>
        <p>
          Stripe will securely confirm the result. Your LifeStats access will update from the verified payment event, even if you close this page.
        </p>
        <Link className="button button--primary" href="/dashboard">Return to your sheet</Link>
      </Panel>
    </main>
  );
}
