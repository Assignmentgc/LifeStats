import { CheckoutButton } from "@/components/billing/checkout-button";
import { Panel } from "@/components/ui";

export default function BillingPage() {
  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <p className="eyebrow">Payments</p>
          <h1 className="page-title">Secure checkout</h1>
          <p className="page-description">
            Continue to Stripe to complete your purchase. Payment confirmation and access changes are handled securely after Stripe verifies the payment.
          </p>
        </div>
      </header>

      <Panel className="billing-card">
        <p className="eyebrow">LifeStats purchase</p>
        <h2>Complete your purchase with Stripe</h2>
        <p>
          You will review the product, amount, and payment methods on Stripe&apos;s hosted checkout page before paying.
        </p>
        <CheckoutButton />
      </Panel>
    </main>
  );
}
