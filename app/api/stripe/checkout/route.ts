import { NextRequest, NextResponse } from "next/server";
import { getCheckoutIntegrationIdentifier, getStripeClient } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getSiteOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configuredUrl) throw new Error("Missing NEXT_PUBLIC_SITE_URL.");
  return new URL(configuredUrl).origin;
}

export async function POST(request: NextRequest) {
  try {
    const siteOrigin = getSiteOrigin();
    if (request.headers.get("origin") !== siteOrigin) {
      return NextResponse.json({ error: "Invalid checkout request origin." }, { status: 403 });
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return NextResponse.json({ error: "Checkout is not configured yet." }, { status: 503 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in before starting checkout." }, { status: 401 });
    }

    const session = await getStripeClient().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: {
        supabase_user_id: user.id,
        stripe_price_id: priceId,
      },
      success_url: `${siteOrigin}/billing/success`,
      cancel_url: `${siteOrigin}/billing/cancelled`,
      integration_identifier: getCheckoutIntegrationIdentifier(),
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
    }

    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: "Unable to start checkout. Please try again." }, { status: 500 });
  }
}
