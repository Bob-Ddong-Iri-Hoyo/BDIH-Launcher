import { EventEmitter } from "events";
import { jest } from "@jest/globals";
import type { Client } from "discord-rpc";

interface MockDiscordClient extends EventEmitter {
  login: ReturnType<typeof jest.fn>;
  setActivity: ReturnType<typeof jest.fn>;
  clearActivity: ReturnType<typeof jest.fn>;
  destroy: ReturnType<typeof jest.fn>;
}

interface DiscordPresenceHarness {
  manager: import("../../../src/Main/Manager/DiscordPresenceManager").DiscordPresenceManager;
  client: MockDiscordClient;
  logger: {
    debug: ReturnType<typeof jest.fn>;
    info: ReturnType<typeof jest.fn>;
    warn: ReturnType<typeof jest.fn>;
    error: ReturnType<typeof jest.fn>;
  };
}

function never_settles(): Promise<never> {
  return new Promise(() => undefined);
}

function create_harness(
  configureClient: (client: MockDiscordClient) => void,
): DiscordPresenceHarness {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const client = new EventEmitter() as MockDiscordClient;

  client.login = jest.fn(async () => client);
  client.setActivity = jest.fn(async () => undefined);
  client.clearActivity = jest.fn(async () => undefined);
  client.destroy = jest.fn(async () => undefined);
  configureClient(client);

  jest.doMock("../../../src/Main/Manager/LogManager", () => ({
    logManager: {
      createLogger: jest.fn(() => logger),
    },
  }));

  const {
    DiscordPresenceManager,
  } = require("../../../src/Main/Manager/DiscordPresenceManager") as typeof import("../../../src/Main/Manager/DiscordPresenceManager");

  return {
    manager: new DiscordPresenceManager({
      createClient: () => client as unknown as Client,
      shutdownOperationTimeoutMs: 10,
    }),
    client,
    logger,
  };
}

describe("DiscordPresenceManager shutdown", () => {
  const previousClientId = process.env.BDIH_DISCORD_CLIENT_ID;

  beforeEach(() => {
    jest.resetModules();
    process.env.BDIH_DISCORD_CLIENT_ID = "test-client-id";
  });

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    if (previousClientId === undefined) {
      delete process.env.BDIH_DISCORD_CLIENT_ID;
    } else {
      process.env.BDIH_DISCORD_CLIENT_ID = previousClientId;
    }
  });

  it("does not wait forever when clearActivity and destroy lose their RPC responses", async () => {
    const { manager, client, logger } = create_harness((mockClient) => {
      mockClient.login = jest.fn(async () => {
        mockClient.emit("ready");
        return mockClient;
      });
      mockClient.clearActivity = jest.fn(never_settles);
      mockClient.destroy = jest.fn(never_settles);
    });

    manager.init("ko");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(client.setActivity).toHaveBeenCalled();

    await manager.shutdown();

    expect(client.clearActivity).toHaveBeenCalledTimes(1);
    expect(client.destroy).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "Discord shutdown operation timed out",
      expect.objectContaining({ operation: "clear activity" }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "Discord shutdown operation timed out",
      expect.objectContaining({ operation: "destroy client" }),
    );
  });

  it("skips clearActivity for a client that never finished connecting", async () => {
    const { manager, client, logger } = create_harness((mockClient) => {
      mockClient.login = jest.fn(never_settles);
    });

    manager.init("ko");
    await new Promise<void>((resolve) => setImmediate(resolve));
    await manager.shutdown();

    expect(client.clearActivity).not.toHaveBeenCalled();
    expect(client.destroy).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "Discord shutdown operation timed out",
      expect.objectContaining({ operation: "pending refresh" }),
    );
  });
});
