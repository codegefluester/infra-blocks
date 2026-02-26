import type {
  WebhookService,
  NormalizedRequest,
  WebhookResponse,
} from "./base.js";

/**
 * Strava webhook handler.
 *
 * Strava requires webhook subscription verification via GET request:
 * https://developers.strava.com/docs/webhooks/
 *
 * When creating a subscription, Strava sends:
 * - hub.mode: "subscribe"
 * - hub.challenge: Random string to echo back
 * - hub.verify_token: Token provided during subscription creation
 *
 * Must respond within 2 seconds with:
 * - Status: 200
 * - Body: {"hub.challenge": "<value>"}
 */
export const stravaService: WebhookService = {
  name: "strava",

  async handleValidation(req: NormalizedRequest): Promise<WebhookResponse | null> {
    // Only handle GET requests to /webhook/strava
    if (req.method !== "GET") {
      return null; // Not a validation request, continue normal processing
    }

    const { "hub.mode": mode, "hub.challenge": challenge, "hub.verify_token": verifyToken } = req.query;

    // Strava validation request
    if (mode === "subscribe" && challenge) {
      // Optional: validate the verify_token if you want extra security
      // You could check it against an environment variable:
      // if (process.env.STRAVA_VERIFY_TOKEN && verifyToken !== process.env.STRAVA_VERIFY_TOKEN) {
      //   return { statusCode: 403, body: JSON.stringify({ error: "Invalid verify token" }) };
      // }

      // Echo back the challenge
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "hub.challenge": challenge }),
      };
    }

    // Not a validation request
    return null;
  },
};
