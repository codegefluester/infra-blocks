/**
 * Base interface for service-specific webhook handlers.
 * Each service can implement custom validation and transformation logic.
 */

export interface NormalizedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
  query: Record<string, string>;
}

export interface WebhookResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

export interface WebhookEnvelope {
  receivedAt: string;
  service: string;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
}

/**
 * Service-specific webhook handler interface.
 */
export interface WebhookService {
  /**
   * The service identifier (e.g., "strava", "github", "stripe").
   */
  readonly name: string;

  /**
   * Handle validation/challenge requests (e.g., webhook subscription verification).
   * Return a response to immediately return to the caller, or null to continue normal processing.
   *
   * @example Strava sends GET requests with hub.challenge parameter
   * @example GitHub sends POST requests with X-Hub-Signature for validation
   */
  handleValidation?(
    req: NormalizedRequest,
  ): Promise<WebhookResponse | null>;

  /**
   * Optional: Transform or enrich the webhook envelope before storage.
   * Useful for extracting metadata, normalizing formats, etc.
   */
  transformEnvelope?(envelope: WebhookEnvelope): Promise<WebhookEnvelope>;
}
