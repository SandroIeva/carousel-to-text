export class ProviderFailure extends Error {}
export function providerHttpFailure(
  provider: "Gemini" | "Apify" | "Image",
  status: number,
) {
  if (provider === "Image") return new ProviderFailure(`Image HTTP ${status}: Could not download the image. The media URL may have expired or access may be blocked. Please try a new extraction.`);
  const reason =
    status === 429
      ? "Rate limit or quota exceeded. Check provider usage and billing; this does not necessarily require payment."
      : status === 401 || status === 403
        ? "Access denied. Check the API key and its permissions."
        : status === 400
          ? "Request rejected. Check the API key, model and request configuration."
          : status === 404
            ? "Resource or model not found."
            : status >= 500
              ? "Provider temporarily unavailable. Please retry later."
              : "Request failed.";
  return new ProviderFailure(`${provider} HTTP ${status}: ${reason}`);
}
