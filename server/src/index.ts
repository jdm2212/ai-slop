import express, { Request, Response } from "express";
import cors from "cors";
import { createServer, Server as HttpServer } from "http";
import { WebSocketServer, WebSocket, RawData } from "ws";

type MessageType = "message" | "join" | "leave" | "reaction" | "switch_channel" | "create_channel" | "channel_list" | "history" | "thread_message" | "open_thread" | "thread_history" | "auth_error" | "auth_success";

interface ChatMessage {
  type: MessageType;
  id?: string | undefined;
  username: string;
  content: string;
  timestamp: number;
  reactions?: Record<string, string[]> | undefined;
  messageId?: string | undefined;
  emoji?: string | undefined;
  channel?: string | undefined;
  channels?: string[] | undefined;
  messages?: ChatMessage[] | undefined;
  threadId?: string | undefined;
  replyCount?: number | undefined;
  parentMessage?: ChatMessage | undefined;
  password?: string | undefined;
}

const HARDCODED_PASSWORD: string = "password";

interface ClientInfo {
  username: string;
  channel: string;
  activeThreadId?: string | undefined;
}

const app: express.Application = express();
app.use(cors());
app.use(express.json());

const server: HttpServer = createServer(app);
const wss: WebSocketServer = new WebSocketServer({ server });

const clients: Map<WebSocket, ClientInfo> = new Map();
const channels: Set<string> = new Set(["general"]);
const messagesByChannel: Map<string, Map<string, ChatMessage>> = new Map();
messagesByChannel.set("general", new Map());
const threadMessages: Map<string, ChatMessage[]> = new Map();

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function broadcast(message: ChatMessage, channel: string): void {
  const data: string = JSON.stringify(message);
  wss.clients.forEach((client: WebSocket): void => {
    const clientInfo: ClientInfo | undefined = clients.get(client);
    if (client.readyState === WebSocket.OPEN && clientInfo?.channel === channel) {
      client.send(data);
    }
  });
}

function broadcastToAll(message: ChatMessage): void {
  const data: string = JSON.stringify(message);
  wss.clients.forEach((client: WebSocket): void => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function sendChannelList(ws: WebSocket): void {
  const message: ChatMessage = {
    type: "channel_list",
    channels: Array.from(channels),
    username: "",
    content: "",
    timestamp: Date.now(),
  };
  ws.send(JSON.stringify(message));
}

function sendChannelHistory(ws: WebSocket, channel: string): void {
  const channelMessages: Map<string, ChatMessage> | undefined = messagesByChannel.get(channel);
  const messages: ChatMessage[] = channelMessages ? Array.from(channelMessages.values()) : [];
  const historyMessage: ChatMessage = {
    type: "history",
    channel,
    messages,
    username: "",
    content: "",
    timestamp: Date.now(),
  };
  ws.send(JSON.stringify(historyMessage));
}

function broadcastToThread(message: ChatMessage, threadId: string): void {
  const data: string = JSON.stringify(message);
  wss.clients.forEach((client: WebSocket): void => {
    const clientInfo: ClientInfo | undefined = clients.get(client);
    if (client.readyState === WebSocket.OPEN && clientInfo?.activeThreadId === threadId) {
      client.send(data);
    }
  });
}

function sendThreadHistory(ws: WebSocket, threadId: string, channel: string): void {
  const channelMessages: Map<string, ChatMessage> | undefined = messagesByChannel.get(channel);
  if (!channelMessages) return;

  const parentMessage: ChatMessage | undefined = channelMessages.get(threadId);
  if (!parentMessage) return;

  const replies: ChatMessage[] = threadMessages.get(threadId) ?? [];
  const historyMessage: ChatMessage = {
    type: "thread_history",
    threadId,
    messages: replies,
    parentMessage,
    username: "",
    content: "",
    timestamp: Date.now(),
  };
  ws.send(JSON.stringify(historyMessage));
}

wss.on("connection", (ws: WebSocket): void => {
  console.log("New client connected");
  sendChannelList(ws);

  ws.on("message", (data: RawData): void => {
    try {
      const message: ChatMessage = JSON.parse(data.toString()) as ChatMessage;

      if (message.type === "join") {
        if (message.password !== HARDCODED_PASSWORD) {
          const authError: ChatMessage = {
            type: "auth_error",
            username: "",
            content: "Invalid password",
            timestamp: Date.now(),
          };
          ws.send(JSON.stringify(authError));
          return;
        }

        const authSuccess: ChatMessage = {
          type: "auth_success",
          username: message.username,
          content: "Authentication successful",
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(authSuccess));

        const channel: string = "general";
        clients.set(ws, { username: message.username, channel });
        sendChannelHistory(ws, channel);
        const joinMessage: ChatMessage = {
          type: "join",
          username: message.username,
          content: `${message.username} joined #${channel}`,
          timestamp: Date.now(),
          channel,
        };
        broadcast(joinMessage, channel);
      } else if (message.type === "message") {
        const clientInfo: ClientInfo | undefined = clients.get(ws);
        if (!clientInfo) return;

        const id: string = generateId();
        const chatMessage: ChatMessage = {
          type: "message",
          id,
          username: clientInfo.username,
          content: message.content,
          timestamp: Date.now(),
          reactions: {},
          channel: clientInfo.channel,
        };

        const channelMessages: Map<string, ChatMessage> | undefined = messagesByChannel.get(clientInfo.channel);
        if (channelMessages) {
          channelMessages.set(id, chatMessage);
        }
        broadcast(chatMessage, clientInfo.channel);
      } else if (message.type === "reaction") {
        const clientInfo: ClientInfo | undefined = clients.get(ws);
        if (!clientInfo) return;

        const messageId: string | undefined = message.messageId;
        const emoji: string | undefined = message.emoji;
        if (!messageId || !emoji) return;

        const channelMessages: Map<string, ChatMessage> | undefined = messagesByChannel.get(clientInfo.channel);
        if (!channelMessages) return;

        const targetMessage: ChatMessage | undefined = channelMessages.get(messageId);
        if (!targetMessage) return;

        if (!targetMessage.reactions) {
          targetMessage.reactions = {};
        }

        const emojiReactions: string[] | undefined = targetMessage.reactions[emoji];
        if (!emojiReactions) {
          targetMessage.reactions[emoji] = [clientInfo.username];
        } else {
          const userIndex: number = emojiReactions.indexOf(clientInfo.username);
          if (userIndex === -1) {
            emojiReactions.push(clientInfo.username);
          } else {
            emojiReactions.splice(userIndex, 1);
            if (emojiReactions.length === 0) {
              delete targetMessage.reactions[emoji];
            }
          }
        }

        const reactionMessage: ChatMessage = {
          type: "reaction",
          messageId,
          emoji,
          username: clientInfo.username,
          content: "",
          timestamp: Date.now(),
          reactions: targetMessage.reactions,
        };
        broadcast(reactionMessage, clientInfo.channel);
      } else if (message.type === "switch_channel") {
        const clientInfo: ClientInfo | undefined = clients.get(ws);
        if (!clientInfo) return;

        const newChannel: string | undefined = message.channel;
        if (!newChannel || !channels.has(newChannel)) return;

        const oldChannel: string = clientInfo.channel;

        const leaveMessage: ChatMessage = {
          type: "leave",
          username: clientInfo.username,
          content: `${clientInfo.username} left #${oldChannel}`,
          timestamp: Date.now(),
          channel: oldChannel,
        };
        broadcast(leaveMessage, oldChannel);

        clientInfo.channel = newChannel;

        sendChannelHistory(ws, newChannel);

        const joinMessage: ChatMessage = {
          type: "join",
          username: clientInfo.username,
          content: `${clientInfo.username} joined #${newChannel}`,
          timestamp: Date.now(),
          channel: newChannel,
        };
        broadcast(joinMessage, newChannel);
      } else if (message.type === "create_channel") {
        const rawChannelName: string | undefined = message.channel;
        if (!rawChannelName) return;

        const channelName: string = rawChannelName.toLowerCase().replace(/[^a-z0-9-]/g, "");
        if (channelName && !channels.has(channelName)) {
          channels.add(channelName);
          messagesByChannel.set(channelName, new Map());
          const channelListMessage: ChatMessage = {
            type: "channel_list",
            channels: Array.from(channels),
            username: "",
            content: "",
            timestamp: Date.now(),
          };
          broadcastToAll(channelListMessage);
        }
      } else if (message.type === "open_thread") {
        const clientInfo: ClientInfo | undefined = clients.get(ws);
        if (!clientInfo) return;

        const threadId: string | undefined = message.threadId;
        if (!threadId) return;

        clientInfo.activeThreadId = threadId;
        sendThreadHistory(ws, threadId, clientInfo.channel);
      } else if (message.type === "thread_message") {
        const clientInfo: ClientInfo | undefined = clients.get(ws);
        if (!clientInfo) return;

        const threadId: string | undefined = message.threadId;
        if (!threadId) return;

        const channelMessages: Map<string, ChatMessage> | undefined = messagesByChannel.get(clientInfo.channel);
        if (!channelMessages) return;

        const parentMessage: ChatMessage | undefined = channelMessages.get(threadId);
        if (!parentMessage) return;

        const id: string = generateId();
        const threadReply: ChatMessage = {
          type: "thread_message",
          id,
          threadId,
          username: clientInfo.username,
          content: message.content,
          timestamp: Date.now(),
          reactions: {},
        };

        const existingReplies: ChatMessage[] = threadMessages.get(threadId) ?? [];
        existingReplies.push(threadReply);
        threadMessages.set(threadId, existingReplies);

        parentMessage.replyCount = existingReplies.length;

        broadcastToThread(threadReply, threadId);

        const updateMessage: ChatMessage = {
          type: "message",
          id: parentMessage.id,
          username: parentMessage.username,
          content: parentMessage.content,
          timestamp: parentMessage.timestamp,
          reactions: parentMessage.reactions,
          replyCount: parentMessage.replyCount,
          channel: clientInfo.channel,
        };
        broadcast(updateMessage, clientInfo.channel);
      }
    } catch (err: unknown) {
      console.error("Failed to parse message:", err);
    }
  });

  ws.on("close", (): void => {
    const clientInfo: ClientInfo | undefined = clients.get(ws);
    if (clientInfo) {
      const leaveMessage: ChatMessage = {
        type: "leave",
        username: clientInfo.username,
        content: `${clientInfo.username} left #${clientInfo.channel}`,
        timestamp: Date.now(),
        channel: clientInfo.channel,
      };
      broadcast(leaveMessage, clientInfo.channel);
      clients.delete(ws);
    }
    console.log("Client disconnected");
  });
});

app.get("/health", (_req: Request, res: Response): void => {
  res.json({ status: "ok" });
});

const PORT: string | number = process.env["PORT"] ?? 3001;
server.listen(PORT, (): void => {
  console.log(`Server running on http://localhost:${PORT}`);
});
