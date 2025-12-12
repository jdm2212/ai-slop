import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

interface ChatMessage {
  type: "message" | "join" | "leave" | "reaction";
  id?: string;
  username: string;
  content: string;
  timestamp: number;
  reactions?: Record<string, string[]>;
  messageId?: string;
  emoji?: string;
}

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Map<WebSocket, string>();
const messages = new Map<string, ChatMessage>();

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function broadcast(message: ChatMessage) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

wss.on("connection", (ws) => {
  console.log("New client connected");

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString()) as ChatMessage;

      if (message.type === "join") {
        clients.set(ws, message.username);
        broadcast({
          type: "join",
          username: message.username,
          content: `${message.username} joined the chat`,
          timestamp: Date.now(),
        });
      } else if (message.type === "message") {
        const id = generateId();
        const chatMessage: ChatMessage = {
          type: "message",
          id,
          username: clients.get(ws) || "Anonymous",
          content: message.content,
          timestamp: Date.now(),
          reactions: {},
        };
        messages.set(id, chatMessage);
        broadcast(chatMessage);
      } else if (message.type === "reaction") {
        const targetMessage = messages.get(message.messageId!);
        if (targetMessage) {
          const username = clients.get(ws) || "Anonymous";
          const emoji = message.emoji!;

          if (!targetMessage.reactions) {
            targetMessage.reactions = {};
          }
          if (!targetMessage.reactions[emoji]) {
            targetMessage.reactions[emoji] = [];
          }

          const userIndex = targetMessage.reactions[emoji].indexOf(username);
          if (userIndex === -1) {
            targetMessage.reactions[emoji].push(username);
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
            username,
            content: "",
            timestamp: Date.now(),
            reactions: targetMessage.reactions,
          });
        }
      }
    } catch (err) {
      console.error("Failed to parse message:", err);
    }
  });

  ws.on("close", () => {
    const username = clients.get(ws);
    if (username) {
      broadcast({
        type: "leave",
        username,
        content: `${username} left the chat`,
        timestamp: Date.now(),
      });
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
