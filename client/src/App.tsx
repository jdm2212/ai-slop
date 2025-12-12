import { useState, useEffect, useRef, ChangeEvent, KeyboardEvent, FormEvent } from "react";
import EmojiPicker from "./EmojiPicker";

type MessageType = "message" | "join" | "leave" | "reaction" | "switch_channel" | "create_channel" | "channel_list" | "history";

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
}

const QUICK_REACTIONS: readonly string[] = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

function App(): JSX.Element {
  const [username, setUsername] = useState<string>("");
  const [isJoined, setIsJoined] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>("");
  const [channels, setChannels] = useState<string[]>([]);
  const [currentChannel, setCurrentChannel] = useState<string>("general");
  const [newChannelName, setNewChannelName] = useState<string>("");
  const [emojiPickerMessageId, setEmojiPickerMessageId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect((): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const connectToChat = (): void => {
    if (!username.trim()) return;

    const ws: WebSocket = new WebSocket("ws://localhost:3001");
    wsRef.current = ws;

    ws.onopen = (): void => {
      ws.send(JSON.stringify({ type: "join", username }));
      setIsJoined(true);
    };

    ws.onmessage = (event: MessageEvent): void => {
      const message: ChatMessage = JSON.parse(event.data as string) as ChatMessage;
      if (message.type === "channel_list") {
        setChannels(message.channels ?? []);
      } else if (message.type === "history") {
        setMessages(message.messages ?? []);
      } else if (message.type === "reaction") {
        setMessages((prev: ChatMessage[]): ChatMessage[] =>
          prev.map((msg: ChatMessage): ChatMessage => {
            if (msg.id === message.messageId) {
              return { ...msg, reactions: message.reactions };
            }
            return msg;
          })
        );
      } else {
        setMessages((prev: ChatMessage[]): ChatMessage[] => [...prev, message]);
      }
    };

    ws.onclose = (): void => {
      setIsJoined(false);
      wsRef.current = null;
    };
  };

  const sendMessage = (e: FormEvent<HTMLFormElement>): void => {
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

  const sendReaction = (messageId: string, emoji: string): void => {
    if (!wsRef.current) return;
    wsRef.current.send(
      JSON.stringify({
        type: "reaction",
        messageId,
        emoji,
      })
    );
  };

  const switchChannel = (channel: string): void => {
    if (!wsRef.current || channel === currentChannel) return;
    wsRef.current.send(
      JSON.stringify({
        type: "switch_channel",
        channel,
      })
    );
    setCurrentChannel(channel);
  };

  const createChannel = (e: FormEvent<HTMLFormElement>): void => {
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

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleUsernameChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setUsername(e.target.value);
  };

  const handleUsernameKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      connectToChat();
    }
  };

  const handleInputMessageChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setInputMessage(e.target.value);
  };

  const handleNewChannelNameChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setNewChannelName(e.target.value);
  };

  const openEmojiPicker = (messageId: string): void => {
    setEmojiPickerMessageId(messageId);
  };

  const closeEmojiPicker = (): void => {
    setEmojiPickerMessageId(null);
  };

  const handleEmojiSelect = (emoji: string): void => {
    if (emojiPickerMessageId) {
      sendReaction(emojiPickerMessageId, emoji);
      closeEmojiPicker();
    }
  };

  const handleQuickReaction = (messageId: string, emoji: string): void => {
    sendReaction(messageId, emoji);
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
            onChange={handleUsernameChange}
            onKeyDown={handleUsernameKeyDown}
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
            {channels.map((channel: string): JSX.Element => (
              <button
                key={channel}
                className={`channel-item ${channel === currentChannel ? "active" : ""}`}
                onClick={(): void => switchChannel(channel)}
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
              onChange={handleNewChannelNameChange}
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
            {messages.map((msg: ChatMessage, index: number): JSX.Element => (
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
                      {QUICK_REACTIONS.map((emoji: string): JSX.Element | null => {
                        const messageId: string | undefined = msg.id;
                        if (!messageId) return null;
                        return (
                          <button
                            key={emoji}
                            onClick={(): void => handleQuickReaction(messageId, emoji)}
                            className="reaction-btn"
                          >
                            {emoji}
                          </button>
                        );
                      })}
                      {msg.id && (
                        <button
                          className="reaction-btn add-reaction-btn"
                          onClick={(): void => openEmojiPicker(msg.id as string)}
                          title="Add any emoji"
                        >
                          +
                        </button>
                      )}
                      {emojiPickerMessageId === msg.id && (
                        <EmojiPicker
                          onEmojiSelect={handleEmojiSelect}
                          onClose={closeEmojiPicker}
                        />
                      )}
                    </div>
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="reactions">
                        {Object.entries(msg.reactions).map(([emoji, users]: [string, string[]]): JSX.Element | null => {
                          const messageId: string | undefined = msg.id;
                          if (!messageId) return null;
                          return (
                            <button
                              key={emoji}
                              onClick={(): void => sendReaction(messageId, emoji)}
                              className={`reaction-badge ${users.includes(username) ? "active" : ""}`}
                              title={users.join(", ")}
                            >
                              {emoji} {users.length}
                            </button>
                          );
                        })}
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
              onChange={handleInputMessageChange}
            />
            <button type="submit">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
