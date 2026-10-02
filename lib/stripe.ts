import { randomBytes } from "crypto";
import Stripe from "stripe";

const API_VERSION = "2026-08-26.dahlia";
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

let stripeClient: Stripe | undefined;
let integrationIdentifier: string | undefined;

function randomLetters(length: number) {
  return Array.from(randomBytes(length), (byte) => LETTERS[byte % LETTERS.length]).join("");
}

export function getStripeClient() {
  const apiKey = process.env.STRIPE_API_KEY;
  if (!apiKey) throw new Error("Missing STRIPE_API_KEY.");

  stripeClient ??= new Stripe(apiKey, { apiVersion: API_VERSION });
  return stripeClient;
}

export function getCheckoutIntegrationIdentifier() {
  integrationIdentifier ??= `lifestats_checkout_${randomLetters(8)}`;
  return integrationIdentifier;
}
