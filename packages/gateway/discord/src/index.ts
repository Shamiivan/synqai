import { Client, Events, type Message, type TextChannel } from "discord.js";
import type { DiscordGateway, GatewayMessage } from "@synqai/contracts";

export function createDiscordGateway(client: Client): DiscordGateway {
  return {
    onReady(handler) {
      client.once(Events.ClientReady, () => handler());
    },

    onMessage(handler) {
      client.on(Events.MessageCreate, async (message: Message) => {
        const isThread = message.channel.isThread();
        const msg: GatewayMessage = {
          id: message.id,
          content: message.content,
          channelId: message.channelId,
          authorBot: message.author.bot,
          isThread,
          threadId: isThread ? message.channel.id : undefined,
          parentChannelId: isThread ? message.channel.parentId ?? undefined : undefined,
        };
        await handler(msg);
      });
    },

    async fetchThread(threadId) {
      const channel = await client.channels.fetch(threadId);
      if (!channel || !("send" in channel)) return null;
      return {
        send: async (content: string) => {
          await (channel as any).send(content);
        },
      };
    },

    async startThread(channelId, messageId, name) {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !("messages" in channel)) {
        throw new Error(`Channel ${channelId} not found or not text-based`);
      }
      const msg = await (channel as TextChannel).messages.fetch(messageId);
      const thread = await msg.startThread({ name });
      return {
        id: thread.id,
        send: async (content: string) => {
          await thread.send(content);
        },
      };
    },

    async createThread(channelId, name) {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !("threads" in channel)) {
        throw new Error(`Channel ${channelId} not found or not text-based`);
      }
      const thread = await (channel as TextChannel).threads.create({ name });
      return {
        id: thread.id,
        send: async (content: string) => {
          await thread.send(content);
        },
      };
    },

    async reply(channelId, messageId, content) {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !("messages" in channel)) return;
      const msg = await (channel as TextChannel).messages.fetch(messageId);
      await msg.reply(content);
    },

    async login(token) {
      await client.login(token);
    },
  };
}
