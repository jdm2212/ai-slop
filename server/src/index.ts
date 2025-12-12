import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

interface ChatMessage {
  type: "message" | "join" | "leave";
  username: string;
  content: string;
  timestamp: number;
}

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Map<WebSocket, string>();

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
        broadcast({
          type: "message",
          username: clients.get(ws) || "Anonymous",
          content: message.content,
          timestamp: Date.now(),
        });
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
