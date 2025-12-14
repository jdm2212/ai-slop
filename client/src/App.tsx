import { useState, useEffect, useRef, ChangeEvent, KeyboardEvent, FormEvent } from "react";
import EmojiPicker from "./EmojiPicker";

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
}

const QUICK_REACTIONS: readonly string[] = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

function App(): JSX.Element {
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loginError, setLoginError] = useState<string>("");
  const [isJoined, setIsJoined] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>("");
  const [channels, setChannels] = useState<string[]>([]);
  const [currentChannel, setCurrentChannel] = useState<string>("general");
  const [newChannelName, setNewChannelName] = useState<string>("");
  const [emojiPickerMessageId, setEmojiPickerMessageId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [threadParentMessage, setThreadParentMessage] = useState<ChatMessage | null>(null);
  const [threadInput, setThreadInput] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const threadMessagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect((): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect((): void => {
    threadMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  const connectToChat = (): void => {
    if (!username.trim()) {
      setLoginError("Username is required");
      return;
    }
    if (!password) {
      setLoginError("Password is required");
      return;
    }

    const ws: WebSocket = new WebSocket("ws://localhost:3001");
    wsRef.current = ws;

    ws.onopen = (): void => {
      ws.send(JSON.stringify({ type: "join", username, password }));
    };

    ws.onmessage = (event: MessageEvent): void => {
      const message: ChatMessage = JSON.parse(event.data as string) as ChatMessage;
      if (message.type === "auth_error") {
        setLoginError(message.content);
        ws.close();
        return;
      } else if (message.type === "auth_success") {
        setIsJoined(true);
      } else if (message.type === "channel_list") {
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
      } else if (message.type === "thread_history") {
        setThreadMessages(message.messages ?? []);
        if (message.parentMessage) {
          setThreadParentMessage(message.parentMessage);
        }
      } else if (message.type === "thread_message") {
        setThreadMessages((prev: ChatMessage[]): ChatMessage[] => [...prev, message]);
      } else if (message.type === "message" && message.id) {
        setMessages((prev: ChatMessage[]): ChatMessage[] => {
          const existingIndex: number = prev.findIndex((m: ChatMessage): boolean => m.id === message.id);
          if (existingIndex >= 0) {
            const updated: ChatMessage[] = [...prev];
            updated[existingIndex] = message;
            return updated;
          }
          return [...prev, message];
        });
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
    setLoginError("");
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setPassword(e.target.value);
    setLoginError("");
  };

  const handleLoginKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
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

  const openThread = (messageId: string): void => {
    if (!wsRef.current) return;
    setActiveThreadId(messageId);
    setThreadMessages([]);
    setThreadParentMessage(null);
    wsRef.current.send(
      JSON.stringify({
        type: "open_thread",
        threadId: messageId,
      })
    );
  };

  const closeThread = (): void => {
    setActiveThreadId(null);
    setThreadMessages([]);
    setThreadParentMessage(null);
    setThreadInput("");
  };

  const sendThreadMessage = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!threadInput.trim() || !wsRef.current || !activeThreadId) return;

    wsRef.current.send(
      JSON.stringify({
        type: "thread_message",
        threadId: activeThreadId,
        content: threadInput,
      })
    );
    setThreadInput("");
  };

  const handleThreadInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setThreadInput(e.target.value);
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setSearchQuery(e.target.value);
  };

  const toggleSearch = (): void => {
    setIsSearching((prev: boolean): boolean => !prev);
    if (isSearching) {
      setSearchQuery("");
    }
  };

  const wildcardToRegex = (pattern: string): RegExp => {
    const escaped: string = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const withWildcards: string = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp(withWildcards, "i");
  };

  const matchesSearch = (content: string, query: string): boolean => {
    if (!query.trim()) return true;
    const regex: RegExp = wildcardToRegex(query);
    return regex.test(content);
  };

  const filteredMessages: ChatMessage[] = searchQuery.trim()
    ? messages.filter((msg: ChatMessage): boolean =>
        msg.type === "message" && matchesSearch(msg.content, searchQuery)
      )
    : messages;

  if (!isJoined) {
    return (
      <div className="container">
        <div className="join-form">
          <h1>Chat App</h1>
          {loginError && <div className="login-error">{loginError}</div>}
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={handleUsernameChange}
            onKeyDown={handleLoginKeyDown}
          />
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={handlePasswordChange}
            onKeyDown={handleLoginKeyDown}
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
            <div className="header-left">
              <h1>#{currentChannel}</h1>
              {isSearching && (
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search messages... (* = any, ? = single char)"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    autoFocus
                  />
                  {searchQuery && (
                    <span className="search-count">
                      {filteredMessages.filter((m: ChatMessage): boolean => m.type === "message").length} results
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="header-right">
              <button className="search-toggle" onClick={toggleSearch} title="Search messages">
                {isSearching ? "✕" : "🔍"}
              </button>
              <span>Logged in as {username}</span>
            </div>
          </header>

          <div className="messages">
            {filteredMessages.map((msg: ChatMessage, index: number): JSX.Element => (
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
                    <div className="message-actions">
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
                      {msg.id && (
                        <button
                          className="reply-btn"
                          onClick={(): void => openThread(msg.id as string)}
                        >
                          {msg.replyCount ? `${msg.replyCount} ${msg.replyCount === 1 ? "reply" : "replies"}` : "Reply"}
                        </button>
                      )}
                    </div>
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

        {activeThreadId && (
          <aside className="thread-panel">
            <div className="thread-header">
              <h2>Thread</h2>
              <button className="close-thread-btn" onClick={closeThread}>×</button>
            </div>

            {threadParentMessage && (
              <div className="thread-parent">
                <div className="message-header">
                  <strong>{threadParentMessage.username}</strong>
                  <span className="time">{formatTime(threadParentMessage.timestamp)}</span>
                </div>
                <p>{threadParentMessage.content}</p>
              </div>
            )}

            <div className="thread-divider">
              {threadMessages.length} {threadMessages.length === 1 ? "reply" : "replies"}
            </div>

            <div className="thread-messages">
              {threadMessages.map((msg: ChatMessage, index: number): JSX.Element => (
                <div key={index} className={`thread-message ${msg.username === username ? "own" : ""}`}>
                  <div className="message-header">
                    <strong>{msg.username}</strong>
                    <span className="time">{formatTime(msg.timestamp)}</span>
                  </div>
                  <p>{msg.content}</p>
                </div>
              ))}
              <div ref={threadMessagesEndRef} />
            </div>

            <form onSubmit={sendThreadMessage} className="thread-input-form">
              <input
                type="text"
                placeholder="Reply..."
                value={threadInput}
                onChange={handleThreadInputChange}
              />
              <button type="submit">Send</button>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}

export default App;
