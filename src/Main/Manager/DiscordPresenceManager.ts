import { Client, type Presence } from "discord-rpc";
import type { BottleLauncherKind } from "../../Common/Types/IPC";
import enLocale from "../../../resouces/locales/en.json";
import jaLocale from "../../../resouces/locales/ja.json";
import koLocale from "../../../resouces/locales/ko.json";
import zhLocale from "../../../resouces/locales/zh.json";
import { logManager } from "./LogManager";

const CLIENT_ID_ENV = "BDIH_DISCORD_CLIENT_ID";
const SHOW_IDLE_ENV = "BDIH_DISCORD_SHOW_IDLE";
const LARGE_IMAGE_KEY_ENV = "BDIH_DISCORD_LARGE_IMAGE_KEY";
const LARGE_IMAGE_TEXT_ENV = "BDIH_DISCORD_LARGE_IMAGE_TEXT";
const SMALL_IMAGE_KEY_ENV = "BDIH_DISCORD_SMALL_IMAGE_KEY";
const SMALL_IMAGE_TEXT_ENV = "BDIH_DISCORD_SMALL_IMAGE_TEXT";
const DISCORD_TEXT_LIMIT = 128;
const CONNECTION_ERROR_LOG_INTERVAL_MS = 60_000;
const FALLBACK_PRESENCE_LOCALE = "ko";
const BUILD_TIME_DISCORD_ENV = {
  [CLIENT_ID_ENV]: process.env.BDIH_DISCORD_CLIENT_ID,
  [SHOW_IDLE_ENV]: process.env.BDIH_DISCORD_SHOW_IDLE,
  [LARGE_IMAGE_KEY_ENV]: process.env.BDIH_DISCORD_LARGE_IMAGE_KEY,
  [LARGE_IMAGE_TEXT_ENV]: process.env.BDIH_DISCORD_LARGE_IMAGE_TEXT,
  [SMALL_IMAGE_KEY_ENV]: process.env.BDIH_DISCORD_SMALL_IMAGE_KEY,
  [SMALL_IMAGE_TEXT_ENV]: process.env.BDIH_DISCORD_SMALL_IMAGE_TEXT,
} as const;

type DiscordEnvName = keyof typeof BUILD_TIME_DISCORD_ENV;

const PRESENCE_LOCALE_RESOURCES = {
  ko: koLocale,
  en: enLocale,
  ja: jaLocale,
  zh: zhLocale,
} as const;

type PresenceLocale = keyof typeof PRESENCE_LOCALE_RESOURCES;
type PresenceLocaleResource = {
  translation?: {
    common?: {
      appName?: string;
    };
    discordPresence?: {
      browsingLibrary?: string;
      playingGame?: string;
    };
  };
};

export interface DiscordPresenceBottleActivityInput {
  processId: string;
  bottleName?: string;
  launcher?: BottleLauncherKind;
  appId?: string;
  appName?: string;
  executablePath?: string;
  startedAt?: string | number | Date;
}

interface DiscordPresenceActivity extends DiscordPresenceBottleActivityInput {
  startedAtMs: number;
}

export class DiscordPresenceManager {
  private readonly logger = logManager.createLogger("DiscordPresence");
  private readonly launcherStartedAt = new Date();
  private readonly activities = new Map<string, DiscordPresenceActivity>();
  private clientId: string | undefined;
  private showIdle = true;
  private locale: PresenceLocale = FALLBACK_PRESENCE_LOCALE;
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private ready = false;
  private initialized = false;
  private destroyed = false;
  private hasPublishedActivity = false;
  private lastPresenceKey: string | null = null;
  private lastConnectionErrorAt = 0;

  init(language?: string): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.locale = normalize_presence_locale(language);
    this.clientId = optional_env(CLIENT_ID_ENV);
    this.showIdle = boolean_env(SHOW_IDLE_ENV, true);

    if (!this.clientId) {
      this.logger.debug(`Discord Rich Presence disabled; set ${CLIENT_ID_ENV} to enable it.`);
      return;
    }

    this.logger.info("Discord Rich Presence enabled");
    this.queueRefresh();
  }

  setLanguage(language?: string): void {
    const nextLocale = normalize_presence_locale(language);

    if (nextLocale === this.locale) {
      return;
    }

    this.locale = nextLocale;
    this.lastPresenceKey = null;
    this.queueRefresh();
  }

  setBottleActivity(input: DiscordPresenceBottleActivityInput): void {
    if (!this.clientId || should_ignore_presence_activity(input)) {
      return;
    }

    this.activities.set(input.processId, {
      ...input,
      startedAtMs: coerce_started_at_ms(input.startedAt),
    });
    this.queueRefresh();
  }

  clearActivity(processId: string): void {
    if (!this.activities.delete(processId)) {
      return;
    }

    this.queueRefresh();
  }

  clearAllActivities(): void {
    if (this.activities.size === 0) {
      return;
    }

    this.activities.clear();
    this.queueRefresh();
  }

  async shutdown(): Promise<void> {
    this.destroyed = true;
    this.activities.clear();

    const client = this.client;
    this.client = null;
    this.connecting = null;
    this.ready = false;
    this.hasPublishedActivity = false;
    this.lastPresenceKey = null;

    if (!client) {
      return;
    }

    await client.clearActivity().catch(() => undefined);
    await client.destroy().catch(() => undefined);
  }

  private queueRefresh(): void {
    void this.refresh().catch((error) => {
      this.logConnectionError(error);
    });
  }

  private async refresh(): Promise<void> {
    if (!this.clientId || this.destroyed) {
      return;
    }

    const presence = this.buildPresence();
    const presenceKey = presence ? JSON.stringify(presence) : "clear";

    if (presenceKey === this.lastPresenceKey) {
      return;
    }

    const client = await this.ensureClient();

    if (!client) {
      return;
    }

    if (!presence) {
      if (this.hasPublishedActivity) {
        await client.clearActivity();
        this.hasPublishedActivity = false;
      }

      this.lastPresenceKey = presenceKey;
      return;
    }

    await client.setActivity(presence);
    this.hasPublishedActivity = true;
    this.lastPresenceKey = presenceKey;
  }

  private buildPresence(): Presence | undefined {
    const activity = latest_activity(this.activities);
    const text = get_presence_locale_text(this.locale);

    if (!activity) {
      return this.showIdle ? this.withConfiguredAssets({
        details: text.browsingLibrary,
        startTimestamp: this.launcherStartedAt,
        instance: false,
      }, text) : undefined;
    }

    return this.withConfiguredAssets({
      details: text.playingGame,
      startTimestamp: new Date(activity.startedAtMs),
      instance: false,
    }, text);
  }

  private withConfiguredAssets(presence: Presence, text: PresenceLocaleText): Presence {
    const largeImageKey = optional_env(LARGE_IMAGE_KEY_ENV);
    const largeImageText = optional_env(LARGE_IMAGE_TEXT_ENV) ?? text.appName;
    const smallImageKey = optional_env(SMALL_IMAGE_KEY_ENV);
    const smallImageText = optional_env(SMALL_IMAGE_TEXT_ENV);

    return {
      ...presence,
      ...(largeImageKey ? { largeImageKey } : {}),
      ...(largeImageText ? { largeImageText: truncate_discord_text(largeImageText) } : {}),
      ...(smallImageKey ? { smallImageKey } : {}),
      ...(smallImageText ? { smallImageText: truncate_discord_text(smallImageText) } : {}),
    };
  }

  private async ensureClient(): Promise<Client | null> {
    if (this.destroyed || !this.clientId) {
      return null;
    }

    if (this.client && this.ready) {
      return this.client;
    }

    if (this.connecting) {
      await this.connecting.catch(() => undefined);
      return this.client && this.ready ? this.client : null;
    }

    const client = new Client({ transport: "ipc" });

    this.client = client;
    this.ready = false;
    client.on("ready", () => {
      if (this.destroyed || this.client !== client) {
        return;
      }

      this.ready = true;
      this.logger.info("Discord Rich Presence connected");
    });
    client.on("disconnected", () => {
      if (this.client !== client) {
        return;
      }

      this.ready = false;
      this.client = null;
      this.hasPublishedActivity = false;
      this.lastPresenceKey = null;
      this.logger.warn("Discord Rich Presence disconnected");
    });
    client.on("error", (error) => {
      this.logConnectionError(error);
    });

    this.connecting = client.login({ clientId: this.clientId })
      .then(() => {
        if (this.destroyed || this.client !== client) {
          return;
        }

        this.ready = true;
      })
      .catch((error) => {
        this.ready = false;
        this.client = this.client === client ? null : this.client;
        void client.destroy().catch(() => undefined);
        throw error;
      })
      .finally(() => {
        this.connecting = null;
      });

    await this.connecting.catch((error) => {
      this.logConnectionError(error);
    });

    return this.client && this.ready ? this.client : null;
  }

  private logConnectionError(error: unknown): void {
    const now = Date.now();

    if (now - this.lastConnectionErrorAt < CONNECTION_ERROR_LOG_INTERVAL_MS) {
      return;
    }

    this.lastConnectionErrorAt = now;
    this.logger.debug("Discord Rich Presence unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function latest_activity(activities: Map<string, DiscordPresenceActivity>): DiscordPresenceActivity | undefined {
  let latest: DiscordPresenceActivity | undefined;

  for (const activity of activities.values()) {
    if (!latest || activity.startedAtMs > latest.startedAtMs) {
      latest = activity;
    }
  }

  return latest;
}

function should_ignore_presence_activity(input: DiscordPresenceBottleActivityInput): boolean {
  return input.appId?.startsWith("installer:") ?? false;
}

function coerce_started_at_ms(startedAt?: string | number | Date): number {
  if (startedAt instanceof Date) {
    return startedAt.getTime();
  }

  if (typeof startedAt === "number" && Number.isFinite(startedAt)) {
    return startedAt;
  }

  if (typeof startedAt === "string") {
    const parsed = Date.parse(startedAt);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}

function truncate_discord_text(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.length > DISCORD_TEXT_LIMIT
    ? value.slice(0, DISCORD_TEXT_LIMIT)
    : value;
}

function optional_env(name: string): string | undefined {
  const runtimeValue = process.env[name]?.trim();
  const buildTimeValue = is_discord_env_name(name)
    ? BUILD_TIME_DISCORD_ENV[name]?.trim()
    : undefined;
  const value = runtimeValue || buildTimeValue;

  return value || undefined;
}

function boolean_env(name: string, fallback: boolean): boolean {
  const value = optional_env(name)?.toLowerCase();

  if (!value) {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(value);
}

function is_discord_env_name(name: string): name is DiscordEnvName {
  return name in BUILD_TIME_DISCORD_ENV;
}

interface PresenceLocaleText {
  appName: string;
  browsingLibrary: string;
  playingGame: string;
}

function normalize_presence_locale(language?: string): PresenceLocale {
  const normalized = language?.split("-")[0]?.toLowerCase();

  return is_presence_locale(normalized) ? normalized : FALLBACK_PRESENCE_LOCALE;
}

function is_presence_locale(locale: string | undefined): locale is PresenceLocale {
  return Boolean(locale && locale in PRESENCE_LOCALE_RESOURCES);
}

function get_presence_locale_text(locale: PresenceLocale): PresenceLocaleText {
  const resource = PRESENCE_LOCALE_RESOURCES[locale] as PresenceLocaleResource;
  const fallbackResource = PRESENCE_LOCALE_RESOURCES[FALLBACK_PRESENCE_LOCALE] as PresenceLocaleResource;

  return {
    appName: resource.translation?.common?.appName
      ?? fallbackResource.translation?.common?.appName
      ?? "BDIH Launcher",
    browsingLibrary: resource.translation?.discordPresence?.browsingLibrary
      ?? fallbackResource.translation?.discordPresence?.browsingLibrary
      ?? "Browsing library",
    playingGame: resource.translation?.discordPresence?.playingGame
      ?? fallbackResource.translation?.discordPresence?.playingGame
      ?? "Playing game",
  };
}

export const discordPresenceManager = new DiscordPresenceManager();
