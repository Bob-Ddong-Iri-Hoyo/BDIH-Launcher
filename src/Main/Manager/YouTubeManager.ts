import {
  YouTubeLiveStatusPayload,
  YouTubeLiveStatusRequest,
} from "../../Common/Types/IPC";
import { logManager } from "./LogManager";

interface YouTubeSearchResponse {
  items?: unknown[];
  error?: {
    message?: string;
  };
}

interface ChannelIdCacheEntry {
  channelId: string;
  expiresAt: number;
}

interface LiveStatusCacheEntry {
  payload: YouTubeLiveStatusPayload;
  expiresAt: number;
}

const CHANNEL_ID_CACHE_TTL_MS = 24 * 60 * 60_000;
const LIVE_STATUS_CACHE_TTL_MS = 60_000;
const OFFLINE_STATUS_CACHE_TTL_MS = 10_000;
const YOUTUBE_PAGE_HEADERS = {
  "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
};

export class YouTubeManager {
  private readonly logger = logManager.createLogger("YouTubeManager");
  private readonly channelIdCache = new Map<string, ChannelIdCacheEntry>();
  private readonly liveStatusCache = new Map<string, LiveStatusCacheEntry>();
  private readonly liveStatusRequests = new Map<string, Promise<YouTubeLiveStatusPayload>>();

  async getLiveStatus(
    request: YouTubeLiveStatusRequest = {},
  ): Promise<YouTubeLiveStatusPayload> {
    const requestKey = request.channelId?.trim()
      || (request.handle ? normalize_youtube_handle(request.handle) : undefined);

    if (!requestKey) {
      return this.createPayload(false, undefined, "YouTube channel or handle is required.");
    }

    const activeRequest = this.liveStatusRequests.get(requestKey);
    if (activeRequest) {
      return activeRequest;
    }

    const statusRequest = this.resolveLiveStatus(request);
    this.liveStatusRequests.set(requestKey, statusRequest);

    try {
      return await statusRequest;
    } finally {
      if (this.liveStatusRequests.get(requestKey) === statusRequest) {
        this.liveStatusRequests.delete(requestKey);
      }
    }
  }

  private async resolveLiveStatus(
    request: YouTubeLiveStatusRequest,
  ): Promise<YouTubeLiveStatusPayload> {
    try {
      const channelId = await this.resolveChannelId(request).catch((error) => {
        this.logger.warn("YouTube channel ID resolution failed; falling back to live page.", this.describeError(error));
        return undefined;
      });
      const cacheKey = this.getLiveStatusCacheKey(request, channelId);

      if (!cacheKey) return this.createPayload(false, undefined, "YouTube channel or handle is required.");

      const cached = this.getCachedLiveStatus(cacheKey);
      if (cached) {
        return cached;
      }

      const apiKey = process.env.YOUTUBE_API_KEY;
      let payload: YouTubeLiveStatusPayload;

      if (apiKey && channelId) {
        try {
          const isLive = await this.fetchLiveStatus(channelId, apiKey);
          payload = isLive
            ? this.createPayload(true, channelId)
            : await this.fetchLiveStatusFromPage(request, channelId);
        } catch (error) {
          this.logger.warn("YouTube API live status check failed; falling back to live page.", this.describeError(error));
          payload = await this.fetchLiveStatusFromPage(request, channelId);
        }
      } else {
        payload = await this.fetchLiveStatusFromPage(request, channelId);
      }

      this.cacheLiveStatus(cacheKey, payload);

      if (payload.channelId) {
        this.cacheLiveStatus(payload.channelId, payload);
      }

      return payload;
    } catch (error) {
      const message = this.describeError(error);
      this.logger.warn("Live status check failed.", message);
      return this.createPayload(false, request.channelId, message);
    }
  }

  private async resolveChannelId(
    request: YouTubeLiveStatusRequest,
  ): Promise<string | undefined> {
    if (request.channelId) {
      return request.channelId;
    }

    if (!request.handle) {
      return undefined;
    }

    return this.getChannelIdFromHandle(request.handle);
  }

  private async getChannelIdFromHandle(handle: string): Promise<string | undefined> {
    const normalizedHandle = normalize_youtube_handle(handle);
    const cached = this.channelIdCache.get(normalizedHandle);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.channelId;
    }

    const response = await fetch(`https://www.youtube.com/${normalizedHandle}`, {
      headers: YOUTUBE_PAGE_HEADERS,
    });

    if (!response.ok) {
      throw new Error(`YouTube channel page failed: ${response.status}`);
    }

    const html = await response.text();
    const match = html.match(/"channelId":"(UC[^"]+)"/);
    const channelId = match?.[1];

    if (channelId) {
      this.cacheChannelId(normalizedHandle, channelId);
    }

    return channelId;
  }

  private async fetchLiveStatus(channelId: string, apiKey: string): Promise<boolean> {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("channelId", channelId);
    url.searchParams.set("eventType", "live");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url);
    const data = (await response.json()) as YouTubeSearchResponse;

    if (!response.ok) {
      throw new Error(data.error?.message ?? `YouTube API failed: ${response.status}`);
    }

    return Array.isArray(data.items) && data.items.length > 0;
  }

  private async fetchLiveStatusFromPage(
    request: YouTubeLiveStatusRequest,
    channelId?: string,
  ): Promise<YouTubeLiveStatusPayload> {
    const liveUrl = create_youtube_live_url(request, channelId);

    if (!liveUrl) {
      return this.createPayload(false, channelId, "YouTube live page could not be resolved.");
    }

    const response = await fetch(liveUrl, {
      headers: YOUTUBE_PAGE_HEADERS,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`YouTube live page failed: ${response.status}`);
    }

    const html = await response.text();
    const detectedChannelId = channelId ?? extract_channel_id_from_youtube_html(html);
    const normalizedHandle = request.handle ? normalize_youtube_handle(request.handle) : undefined;

    if (normalizedHandle && detectedChannelId) {
      this.cacheChannelId(normalizedHandle, detectedChannelId);
    }

    return this.createPayload(is_youtube_live_page(html), detectedChannelId);
  }

  private getCachedLiveStatus(
    cacheKey: string,
  ): YouTubeLiveStatusPayload | undefined {
    const cached = this.liveStatusCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }

    return undefined;
  }

  private cacheLiveStatus(cacheKey: string, payload: YouTubeLiveStatusPayload): void {
    this.liveStatusCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + (payload.isLive ? LIVE_STATUS_CACHE_TTL_MS : OFFLINE_STATUS_CACHE_TTL_MS),
    });
  }

  private cacheChannelId(handle: string, channelId: string): void {
    this.channelIdCache.set(handle, {
      channelId,
      expiresAt: Date.now() + CHANNEL_ID_CACHE_TTL_MS,
    });
  }

  private getLiveStatusCacheKey(
    request: YouTubeLiveStatusRequest,
    channelId?: string,
  ): string | undefined {
    if (channelId) {
      return channelId;
    }

    if (request.handle) {
      return normalize_youtube_handle(request.handle);
    }

    return request.channelId;
  }

  private createPayload(
    isLive: boolean,
    channelId?: string,
    error?: string,
  ): YouTubeLiveStatusPayload {
    return {
      isLive,
      channelId,
      checkedAt: new Date().toISOString(),
      error,
    };
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

function normalize_youtube_handle(handle: string): string {
  return handle.startsWith("@") ? handle : `@${handle}`;
}

function create_youtube_live_url(
  request: YouTubeLiveStatusRequest,
  channelId?: string,
): string | undefined {
  if (request.handle) {
    return `https://www.youtube.com/${normalize_youtube_handle(request.handle)}/live`;
  }

  if (channelId ?? request.channelId) {
    return `https://www.youtube.com/channel/${channelId ?? request.channelId}/live`;
  }

  return undefined;
}

function extract_channel_id_from_youtube_html(html: string): string | undefined {
  return (
    html.match(/"channelId":"(UC[^"]+)"/)?.[1] ??
    html.match(/<meta itemprop="channelId" content="(UC[^"]+)"/)?.[1]
  );
}

function is_youtube_live_page(html: string): boolean {
  if (/"isLiveNow"\s*:\s*true/.test(html)) {
    return true;
  }

  if (/"broadcastStatus"\s*:\s*"ACTIVE"/.test(html)) {
    return true;
  }

  const hasLiveContent = /"isLiveContent"\s*:\s*true/.test(html);
  const hasLiveBroadcastDetails = /"liveBroadcastDetails"\s*:/.test(html);
  const hasWatchEndpoint = /"watchEndpoint"\s*:/.test(html) || /watch\?v=/.test(html);
  const hasOfflineSignal = /"playabilityStatus"\s*:\s*\{[^}]*"status"\s*:\s*"LIVE_STREAM_OFFLINE"/.test(html);
  const hasUpcomingSignal = /"isUpcoming"\s*:\s*true/.test(html) || /"upcomingEventData"\s*:/.test(html);

  return hasLiveContent && hasLiveBroadcastDetails && hasWatchEndpoint && !hasOfflineSignal && !hasUpcomingSignal;
}

export const youtubeManager = new YouTubeManager();
