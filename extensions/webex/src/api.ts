/**
 * Webex REST API client - Pure fetch-based implementation
 * Works in both Node.js and browser environments
 */

const WEBEX_API_BASE = "https://webexapis.com/v1";

export interface WebexPerson {
  id: string;
  emails: string[];
  displayName: string;
  nickName?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  orgId?: string;
  created?: string;
  lastActivity?: string;
  status?: string;
  type?: string;
}

export interface WebexMessage {
  id: string;
  roomId: string;
  roomType: "direct" | "group";
  text?: string;
  markdown?: string;
  html?: string;
  files?: string[];
  personId: string;
  personEmail: string;
  created: string;
  mentionedPeople?: string[];
  mentionedGroups?: string[];
  parentId?: string;
}

export interface WebexRoom {
  id: string;
  title: string;
  type: "direct" | "group";
  isLocked: boolean;
  teamId?: string;
  lastActivity?: string;
  created?: string;
  creatorId?: string;
}

export interface WebexWebhook {
  id: string;
  name: string;
  targetUrl: string;
  resource: string;
  event: string;
  filter?: string;
  secret?: string;
  status: string;
  created?: string;
}

export interface WebexApiError extends Error {
  statusCode: number;
  trackingId?: string;
}

/**
 * Pure REST API client for Webex - no SDK dependencies
 */
export class WebexClient {
  private token: string;

  constructor(botToken: string) {
    this.token = botToken;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: any,
  ): Promise<T> {
    const url = `${WEBEX_API_BASE}${endpoint}`;
    const headers: HeadersInit = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const trackingId = response.headers.get("TrackingID");

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorBody = await response.json();
        errorMessage = errorBody.message || errorBody.error || errorMessage;
      } catch {
        // Ignore JSON parse errors
      }
      const err = new Error(errorMessage) as WebexApiError;
      err.statusCode = response.status;
      err.trackingId = trackingId ?? undefined;
      throw err;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  /**
   * Get the authenticated user's details
   */
  async getMe(): Promise<WebexPerson> {
    return this.request<WebexPerson>("GET", "/people/me");
  }

  /**
   * Get a person by ID
   */
  async getPerson(personId: string): Promise<WebexPerson> {
    return this.request<WebexPerson>("GET", `/people/${encodeURIComponent(personId)}`);
  }

  /**
   * List messages in a room
   */
  async listMessages(params: {
    roomId: string;
    max?: number;
    beforeMessage?: string;
    mentionedPeople?: string;
  }): Promise<{ items: WebexMessage[] }> {
    const queryParams = new URLSearchParams();
    queryParams.set("roomId", params.roomId);
    if (params.max) queryParams.set("max", String(params.max));
    if (params.beforeMessage) queryParams.set("beforeMessage", params.beforeMessage);
    if (params.mentionedPeople) queryParams.set("mentionedPeople", params.mentionedPeople);

    return this.request<{ items: WebexMessage[] }>(
      "GET",
      `/messages?${queryParams.toString()}`,
    );
  }

  /**
   * Get direct messages with a specific person
   */
  async listDirectMessages(personId: string, max?: number): Promise<{ items: WebexMessage[] }> {
    const queryParams = new URLSearchParams();
    queryParams.set("personId", personId);
    if (max) queryParams.set("max", String(max));

    return this.request<{ items: WebexMessage[] }>(
      "GET",
      `/messages/direct?${queryParams.toString()}`,
    );
  }

  /**
   * Get a specific message by ID
   */
  async getMessage(messageId: string): Promise<WebexMessage> {
    return this.request<WebexMessage>("GET", `/messages/${encodeURIComponent(messageId)}`);
  }

  /**
   * Send a message
   */
  async createMessage(params: {
    roomId?: string;
    toPersonId?: string;
    toPersonEmail?: string;
    text?: string;
    markdown?: string;
    files?: string[];
    parentId?: string;
  }): Promise<WebexMessage> {
    return this.request<WebexMessage>("POST", "/messages", params);
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string): Promise<void> {
    await this.request<void>("DELETE", `/messages/${encodeURIComponent(messageId)}`);
  }

  /**
   * List rooms the bot is a member of
   */
  async listRooms(params?: {
    type?: "direct" | "group";
    max?: number;
    sortBy?: "id" | "lastactivity" | "created";
  }): Promise<{ items: WebexRoom[] }> {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.set("type", params.type);
    if (params?.max) queryParams.set("max", String(params.max));
    if (params?.sortBy) queryParams.set("sortBy", params.sortBy);

    const query = queryParams.toString();
    return this.request<{ items: WebexRoom[] }>(
      "GET",
      query ? `/rooms?${query}` : "/rooms",
    );
  }

  /**
   * Get room details
   */
  async getRoom(roomId: string): Promise<WebexRoom> {
    return this.request<WebexRoom>("GET", `/rooms/${encodeURIComponent(roomId)}`);
  }

  /**
   * List all webhooks
   */
  async listWebhooks(): Promise<{ items: WebexWebhook[] }> {
    return this.request<{ items: WebexWebhook[] }>("GET", "/webhooks");
  }

  /**
   * Create a webhook
   */
  async createWebhook(params: {
    name: string;
    targetUrl: string;
    resource: string;
    event: string;
    filter?: string;
    secret?: string;
  }): Promise<WebexWebhook> {
    return this.request<WebexWebhook>("POST", "/webhooks", params);
  }

  /**
   * Update a webhook
   */
  async updateWebhook(
    webhookId: string,
    params: {
      name?: string;
      targetUrl?: string;
      secret?: string;
      status?: "active" | "inactive";
    },
  ): Promise<WebexWebhook> {
    return this.request<WebexWebhook>(
      "PUT",
      `/webhooks/${encodeURIComponent(webhookId)}`,
      params,
    );
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    await this.request<void>("DELETE", `/webhooks/${encodeURIComponent(webhookId)}`);
  }
}
