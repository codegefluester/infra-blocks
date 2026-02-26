import type { WebhookService } from "./base.js";
import { stravaService } from "./strava.js";

/**
 * Registry of all supported webhook services.
 * Add new services here to enable service-specific handling.
 */
const services: WebhookService[] = [
  stravaService,
  // Add more services here as needed:
  // githubService,
  // stripeService,
  // etc.
];

/**
 * Service lookup map for fast access by service name.
 */
export const serviceRegistry = new Map<string, WebhookService>(
  services.map((svc) => [svc.name, svc]),
);

/**
 * Get a service handler by name.
 */
export function getService(name: string): WebhookService | undefined {
  return serviceRegistry.get(name);
}

export type {
  WebhookService,
  NormalizedRequest,
  WebhookResponse,
  WebhookEnvelope,
} from "./base";
