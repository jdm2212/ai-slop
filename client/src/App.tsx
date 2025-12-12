import { useState, useEffect, useRef } from "react";

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

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

function App() {
  const [username, setUsername] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [currentChannel, setCurrentChannel] = useState("general");
  const [newChannelName, setNewChannelName] = useState("");
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
      if (message.type === "channel_list") {
        setChannels(message.channels || []);
      } else if (message.type === "reaction") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === message.messageId
              ? { ...msg, reactions: message.reactions }
              : msg
          )
        );
      } else {
        setMessages((prev) => [...prev, message]);
      }
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

  const sendReaction = (messageId: string, emoji: string) => {
    if (!wsRef.current) return;
    wsRef.current.send(
      JSON.stringify({
        type: "reaction",
        messageId,
        emoji,
      })
    );
  };

  const switchChannel = (channel: string) => {
    if (!wsRef.current || channel === currentChannel) return;
    wsRef.current.send(
      JSON.stringify({
        type: "switch_channel",
        channel,
      })
    );
    setCurrentChannel(channel);
    setMessages([]);
  };

  const createChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsRef.current || !newChannelName.trim()) return;
    wsRef.current.send(
      JSON.stringify({
        type: "create_channel",
        channel: newChannelName.trim(),
      })
    );
    setNewChannelName("");
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
      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>Channels</h2>
          </div>
          <div className="channel-list">
            {channels.map((channel) => (
              <button
                key={channel}
                className={`channel-item ${channel === currentChannel ? "active" : ""}`}
                onClick={() => switchChannel(channel)}
              >
                # {channel}
              </button>
            ))}
          </div>
          <form onSubmit={createChannel} className="create-channel">
            <input
              type="text"
              placeholder="New channel..."
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
            />
            <button type="submit">+</button>
          </form>
        </aside>

        <div className="chat-container">
          <header>
            <h1>#{currentChannel}</h1>
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
                    <div className="reaction-picker">
                      {REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => sendReaction(msg.id!, emoji)}
                          className="reaction-btn"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="reactions">
                        {Object.entries(msg.reactions).map(([emoji, users]) => (
                          <button
                            key={emoji}
                            onClick={() => sendReaction(msg.id!, emoji)}
                            className={`reaction-badge ${users.includes(username) ? "active" : ""}`}
                            title={users.join(", ")}
                          >
                            {emoji} {users.length}
                          </button>
                        ))}
                      </div>
                    )}
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
              placeholder={`Message #${currentChannel}...`}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
            />
            <button type="submit">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
