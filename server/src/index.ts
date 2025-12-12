import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

interface ChatMessage {
  type: "message" | "join" | "leave" | "reaction" | "switch_channel" | "create_channel" | "channel_list";
  id?: string;
  username: string;
  content: string;
  timestamp: number;
  reactions?: Record<string, string[]>;
  messageId?: string;
  emoji?: string;
  channel?: string;
  channels?: string[];
}

interface ClientInfo {
  username: string;
  channel: string;
}

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Map<WebSocket, ClientInfo>();
const channels = new Set<string>(["general"]);
const messagesByChannel = new Map<string, Map<string, ChatMessage>>();
messagesByChannel.set("general", new Map());

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function broadcast(message: ChatMessage, channel: string) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    const clientInfo = clients.get(client);
    if (client.readyState === WebSocket.OPEN && clientInfo?.channel === channel) {
      client.send(data);
    }
  });
}

function broadcastToAll(message: ChatMessage) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function sendChannelList(ws: WebSocket) {
  ws.send(JSON.stringify({
    type: "channel_list",
    channels: Array.from(channels),
    username: "",
    content: "",
    timestamp: Date.now(),
  }));
}

wss.on("connection", (ws) => {
  console.log("New client connected");
  sendChannelList(ws);

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString()) as ChatMessage;

      if (message.type === "join") {
        const channel = "general";
        clients.set(ws, { username: message.username, channel });
        broadcast({
          type: "join",
          username: message.username,
          content: `${message.username} joined #${channel}`,
          timestamp: Date.now(),
          channel,
        }, channel);
      } else if (message.type === "message") {
        const clientInfo = clients.get(ws);
        if (!clientInfo) return;

        const id = generateId();
        const chatMessage: ChatMessage = {
          type: "message",
          id,
          username: clientInfo.username,
          content: message.content,
          timestamp: Date.now(),
          reactions: {},
          channel: clientInfo.channel,
        };

        const channelMessages = messagesByChannel.get(clientInfo.channel);
        if (channelMessages) {
          channelMessages.set(id, chatMessage);
        }
        broadcast(chatMessage, clientInfo.channel);
      } else if (message.type === "reaction") {
        const clientInfo = clients.get(ws);
        if (!clientInfo) return;

        const channelMessages = messagesByChannel.get(clientInfo.channel);
        const targetMessage = channelMessages?.get(message.messageId!);
        if (targetMessage) {
          const emoji = message.emoji!;

          if (!targetMessage.reactions) {
            targetMessage.reactions = {};
          }
          if (!targetMessage.reactions[emoji]) {
            targetMessage.reactions[emoji] = [];
          }

          const userIndex = targetMessage.reactions[emoji].indexOf(clientInfo.username);
          if (userIndex === -1) {
            targetMessage.reactions[emoji].push(clientInfo.username);
          } else {
            targetMessage.reactions[emoji].splice(userIndex, 1);
            if (targetMessage.reactions[emoji].length === 0) {
              delete targetMessage.reactions[emoji];
            }
          }

          broadcast({
            type: "reaction",
            messageId: message.messageId!,
            emoji,
            username: clientInfo.username,
            content: "",
            timestamp: Date.now(),
            reactions: targetMessage.reactions,
          }, clientInfo.channel);
        }
      } else if (message.type === "switch_channel") {
        const clientInfo = clients.get(ws);
        if (!clientInfo) return;

        const newChannel = message.channel!;
        if (!channels.has(newChannel)) return;

        const oldChannel = clientInfo.channel;

        broadcast({
          type: "leave",
          username: clientInfo.username,
          content: `${clientInfo.username} left #${oldChannel}`,
          timestamp: Date.now(),
          channel: oldChannel,
        }, oldChannel);

        clientInfo.channel = newChannel;

        broadcast({
          type: "join",
          username: clientInfo.username,
          content: `${clientInfo.username} joined #${newChannel}`,
          timestamp: Date.now(),
          channel: newChannel,
        }, newChannel);
      } else if (message.type === "create_channel") {
        const channelName = message.channel!.toLowerCase().replace(/[^a-z0-9-]/g, "");
        if (channelName && !channels.has(channelName)) {
          channels.add(channelName);
          messagesByChannel.set(channelName, new Map());
          broadcastToAll({
            type: "channel_list",
            channels: Array.from(channels),
            username: "",
            content: "",
            timestamp: Date.now(),
          });
        }
      }
    } catch (err) {
      console.error("Failed to parse message:", err);
    }
  });

  ws.on("close", () => {
    const clientInfo = clients.get(ws);
    if (clientInfo) {
      broadcast({
        type: "leave",
        username: clientInfo.username,
        content: `${clientInfo.username} left #${clientInfo.channel}`,
        timestamp: Date.now(),
        channel: clientInfo.channel,
      }, clientInfo.channel);
      clients.delete(ws);
    }
    console.log("Client disconnected");
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
