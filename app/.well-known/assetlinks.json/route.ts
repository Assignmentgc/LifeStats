// Digital Asset Links: proves the Android TWA (android/) belongs to this site so
// Chrome opens it full-screen without a URL bar.
// https://developer.android.com/training/app-links/verify-android-applinks
export const dynamic = "force-dynamic";

const DEFAULT_PACKAGE_NAME = "fun.lifestats.app";

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim() || DEFAULT_PACKAGE_NAME;
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  const statements = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: packageName,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];

  return Response.json(statements, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
