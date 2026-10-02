import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function stripeId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

async function recordCompletedCheckout(session: Stripe.Checkout.Session) {
  if (session.payment_status === "unpaid") return;

  const userId = session.metadata?.supabase_user_id ?? session.client_reference_id;
  if (!userId) return;

  const { error } = await createAdminClient().from("stripe_payment_records").upsert(
    {
      user_id: userId,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: stripeId(session.payment_intent),
      stripe_customer_id: stripeId(session.customer),
      stripe_price_id: session.metadata?.stripe_price_id ?? null,
      amount_total: session.amount_total,
      currency: session.currency,
      payment_status: session.payment_status,
      fulfilled_at: new Date().toISOString(),
    },
    { onConflict: "stripe_checkout_session_id" },
  );

  if (error) throw new Error("Unable to persist the completed Stripe checkout session.");
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  if (!webhookSecret || !signature) {
    return NextResponse.json({ error: "Missing Stripe webhook credentials." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await recordCompletedCheckout(event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.async_payment_failed":
        // Stripe remains the source of truth for failed or expired checkouts.
        break;
      default:
        break;
    }
  } catch {
    // A non-2xx response tells Stripe to retry the event.
    return NextResponse.json({ error: "Unable to process Stripe event." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
