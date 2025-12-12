import { useState, useEffect, useRef } from "react";

interface ChatMessage {
  type: "message" | "join" | "leave";
  username: string;
  content: string;
  timestamp: number;
}

function App() {
  const [username, setUsername] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const connectToChat = () => {
    if (!username.trim()) return;

    const ws = new WebSocket("ws://localhost:3001");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", username }));
      setIsJoined(true);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as ChatMessage;
      setMessages((prev) => [...prev, message]);
    };

    ws.onclose = () => {
      setIsJoined(false);
      wsRef.current = null;
    };
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !wsRef.current) return;

    wsRef.current.send(
      JSON.stringify({
        type: "message",
        content: inputMessage,
      })
    );
    setInputMessage("");
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isJoined) {
    return (
      <div className="container">
        <div className="join-form">
          <h1>Chat App</h1>
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && connectToChat()}
          />
          <button onClick={connectToChat}>Join Chat</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="chat-container">
        <header>
          <h1>Chat App</h1>
          <span>Logged in as {username}</span>
        </header>

        <div className="messages">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.type} ${msg.username === username ? "own" : ""}`}
            >
              {msg.type === "message" ? (
                <>
                  <div className="message-header">
                    <strong>{msg.username}</strong>
                    <span className="time">{formatTime(msg.timestamp)}</span>
                  </div>
                  <p>{msg.content}</p>
                </>
              ) : (
                <p className="system-message">{msg.content}</p>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={sendMessage} className="input-form">
          <input
            type="text"
            placeholder="Type a message..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
          />
          <button type="submit">Send</button>
        </form>
      </div>
    </div>
  );
}

export default App;
