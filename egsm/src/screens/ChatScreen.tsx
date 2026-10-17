// src/screens/ChatScreen.tsx
// Phase 5 — Full Group Chat Interface & Sliding-Window Spam Limitation Engine
// STRICT ANTI-CRASH: ONLY built-in react-native components, string fontWeights, zero @react-navigation.

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Image,
  Modal,
  Alert,
  Linking,
  StyleSheet,
  ActivityIndicator,
  Platform,
  StatusBar,
  BackHandler,
  KeyboardAvoidingView,
  Keyboard,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { TOP_SAFE_PADDING } from '../utils/layout';
import { useTheme, ThemeColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useSpamLimiter } from '../hooks/useSpamLimiter';
import {
  fetchMessages,
  sendMessage,
  createPoll,
  voteOnPoll,
  deleteMessage,
  togglePinMessage,
  reportOffense,
} from '../services/chatService';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import type {
  MessageWithSender,
  DocumentAttachment,
  MessageType,
  MediaMeta,
} from '../types/database';
import { SAFE_TOP } from '../utils/layout';
import { HyperlinkText } from '../components/common/HyperlinkText';

const SAFE_TOP_INLINE = Platform.OS === 'android' ? Math.max((StatusBar.currentHeight || 28) + 14, 44) : 50;

// ─────────────────────────────────────────────────────────────
// Curated Presets for Offline / Fallback Media
// ─────────────────────────────────────────────────────────────

interface CuratedGif {
  id: string;
  title: string;
  url: string;
  category: string;
}

const CURATED_GIFS: CuratedGif[] = [
  { id: 'g1', title: 'Thumbs Up', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif', category: 'Reactions' },
  { id: 'g2', title: 'Mind Blown', url: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif', category: 'Reactions' },
  { id: 'g3', title: 'Celebrate / Party', url: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif', category: 'Celebration' },
  { id: 'g4', title: 'Popcorn Time', url: 'https://media.giphy.com/media/GLbiGvv9RiRpK/giphy.gif', category: 'Reactions' },
  { id: 'g5', title: 'Hacker Typing', url: 'https://media.giphy.com/media/ule4akeEDWA0g/giphy.gif', category: 'Crypto' },
  { id: 'g6', title: 'Rocket Moon', url: 'https://media.giphy.com/media/mi6t83UrR5MI8/giphy.gif', category: 'Crypto' },
  { id: 'g7', title: 'Laughing Out Loud', url: 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif', category: 'Reactions' },
  { id: 'g8', title: 'Standing Ovation', url: 'https://media.giphy.com/media/ytTYwIlWYBXji/giphy.gif', category: 'Celebration' },
  { id: 'g9', title: 'Deep Thinking', url: 'https://media.giphy.com/media/d3mlE7uhX8KFgEmY/giphy.gif', category: 'Reactions' },
  { id: 'g10', title: 'Fire / Lit', url: 'https://media.giphy.com/media/nrXif9YExO9EI/giphy.gif', category: 'Hype' },
  { id: 'g11', title: 'Facepalm', url: 'https://media.giphy.com/media/XsUtdIeJ0MWMo/giphy.gif', category: 'Reactions' },
  { id: 'g12', title: 'Shocked / Wow', url: 'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif', category: 'Reactions' },
  { id: 'g13', title: 'Let\'s Go Hype', url: 'https://media.giphy.com/media/DhstvI3CH03yOTXRdC/giphy.gif', category: 'Hype' },
  { id: 'g14', title: 'GG / Well Done', url: 'https://media.giphy.com/media/xT4uQulxzV39haRFjG/giphy.gif', category: 'Celebration' },
  { id: 'g15', title: 'Matrix Streams', url: 'https://media.giphy.com/media/A06UFEx8jxEwU/giphy.gif', category: 'Crypto' },
  { id: 'g16', title: 'Groovy Dancing', url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif', category: 'Celebration' },
];

// ─────────────────────────────────────────────────────────────
// Format Helpers
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Format Helpers
// ─────────────────────────────────────────────────────────────

function formatTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const d = new Date(isoString);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  } catch {
    return 'Recent';
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

const ChatScreen: React.FC = () => {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const spamLimiter = useSpamLimiter(user);

  // Messages list state
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLive, setIsLive] = useState<boolean>(false);
  const flatListRef = useRef<FlatList<MessageWithSender>>(null);
  const mountedRef = useRef<boolean>(true);

  // Input & composer state
  const [inputText, setInputText] = useState<string>('');
  const [isPinnedBannerExpanded, setIsPinnedBannerExpanded] = useState<boolean>(false);

  // Modals state
  const [selectedMessage, setSelectedMessage] = useState<MessageWithSender | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [reportReasonCategory, setReportReasonCategory] = useState<string>('Spam or Promotion');
  const [reportReasonDetails, setReportReasonDetails] = useState<string>('');
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);

  // GIF Search modal
  const [isGifModalOpen, setIsGifModalOpen] = useState<boolean>(false);
  const [gifSearchQuery, setGifSearchQuery] = useState<string>('');
  const [gifCategory, setGifCategory] = useState<string>('All');
  const [giphyResults, setGiphyResults] = useState<CuratedGif[]>([]);
  const [isLoadingGifs, setIsLoadingGifs] = useState<boolean>(false);

  // Media Attachment Modal (Photos, Videos, Audio, Documents)
  const [isAttachModalOpen, setIsAttachModalOpen] = useState<boolean>(false);
  const [attachTab, setAttachTab] = useState<'photo' | 'video' | 'audio' | 'doc'>('photo');
  const [customMediaUrl, setCustomMediaUrl] = useState<string>('');
  const [customMediaName, setCustomMediaName] = useState<string>('');



  // Create Poll Modal
  const [isPollModalOpen, setIsPollModalOpen] = useState<boolean>(false);
  const [pollQuestion, setPollQuestion] = useState<string>('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  // Full-screen Image Zoom Modal
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  // ─── Load Messages ──────────────────────────────────────────
  const loadMessages = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await fetchMessages();
      if (mountedRef.current) {
        setMessages((prev) => {
          if (prev.length === data.length) {
            let identical = true;
            for (let i = 0; i < prev.length; i++) {
              if (
                prev[i].id !== data[i].id ||
                prev[i].content !== data[i].content ||
                prev[i].is_deleted !== data[i].is_deleted ||
                prev[i].is_pinned !== data[i].is_pinned
              ) {
                identical = false;
                break;
              }
            }
            if (identical) return prev;
          }
          return data;
        });
      }
    } catch (err) {
      console.warn('Failed to fetch messages:', err);
    } finally {
      if (mountedRef.current && !silent) {
        setIsLoading(false);
      }
    }
  }, []);

  // Memoized reversed message stream for inverted FlatList
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  // Track if user is near bottom (in inverted list, contentOffset.y <= 60 means near bottom)
  const isNearBottomRef = useRef(true);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = event.nativeEvent;
    isNearBottomRef.current = contentOffset.y <= 60;
  }, []);

  // Hardware Back Button listener: handle sub-modals and previews
  useEffect(() => {
    const onBackPress = () => {
      if (zoomImageUrl !== null) {
        setZoomImageUrl(null);
        return true;
      }
      if (isActionModalOpen) {
        setIsActionModalOpen(false);
        return true;
      }
      if (isReportModalOpen) {
        setIsReportModalOpen(false);
        return true;
      }
      if (isGifModalOpen) {
        setIsGifModalOpen(false);
        return true;
      }
      if (isAttachModalOpen) {
        setIsAttachModalOpen(false);
        return true;
      }
      if (isPollModalOpen) {
        setIsPollModalOpen(false);
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [
    zoomImageUrl,
    isActionModalOpen,
    isReportModalOpen,
    isGifModalOpen,
    isAttachModalOpen,
    isPollModalOpen,
  ]);



  useEffect(() => {
    mountedRef.current = true;
    loadMessages(false);

    if (isSupabaseConfigured) {
      const chatChannel = supabase
        .channel('egsm-chat-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
          loadMessages(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => {
          loadMessages(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => {
          loadMessages(true);
        })
        .subscribe((status) => {
          if (mountedRef.current) {
            setIsLive(status === 'SUBSCRIBED');
          }
        });

      return () => {
        mountedRef.current = false;
        supabase.removeChannel(chatChannel);
      };
    } else {
      // Local mode fallback polling
      const interval = setInterval(() => {
        loadMessages(true);
      }, 4000);
      return () => {
        mountedRef.current = false;
        clearInterval(interval);
      };
    }
  }, [loadMessages]);


  // ─── Giphy Query or Filter ─────────────────────────────────
  useEffect(() => {
    if (!isGifModalOpen) return;

    const apiKey = process.env.EXPO_PUBLIC_GIPHY_API_KEY;
    if (apiKey && apiKey.length > 5) {
      setIsLoadingGifs(true);
      const endpoint = gifSearchQuery.trim().length > 0
        ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(gifSearchQuery)}&limit=20&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=20&rating=g`;

      fetch(endpoint)
        .then((res) => res.json())
        .then((json) => {
          if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
            const mapped: CuratedGif[] = json.data.map((item: any) => ({
              id: item.id,
              title: item.title || 'GIF',
              url: item.images?.fixed_height?.url || item.images?.original?.url || '',
              category: 'Giphy',
            }));
            setGiphyResults(mapped);
          } else {
            fallbackGifs();
          }
        })
        .catch(() => fallbackGifs())
        .finally(() => setIsLoadingGifs(false));
    } else {
      fallbackGifs();
    }

    function fallbackGifs() {
      let filtered = CURATED_GIFS;
      if (gifCategory !== 'All') {
        filtered = filtered.filter((g) => g.category.toLowerCase() === gifCategory.toLowerCase());
      }
      if (gifSearchQuery.trim().length > 0) {
        const q = gifSearchQuery.toLowerCase();
        filtered = filtered.filter((g) => g.title.toLowerCase().includes(q) || g.category.toLowerCase().includes(q));
      }
      setGiphyResults(filtered);
      setIsLoadingGifs(false);
    }
  }, [isGifModalOpen, gifSearchQuery, gifCategory]);

  // ─── Actions ────────────────────────────────────────────────

  // Send standard text message
  const handleSendText = async () => {
    const text = inputText.trim();
    if (!text || !user) return;

    // Check spam limiter
    const allowed = spamLimiter.checkMessage(text, false);
    if (!allowed) return;

    setInputText('');
    try {
      const newMsg = await sendMessage({
        senderId: user.id,
        sender: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
        },
        content: text,
        messageType: 'text',
      });
      setMessages((prev) => [...prev, newMsg]);
    } catch (err) {
      Alert.alert('Send Error', 'Failed to deliver message.');
    }
  };

  // Send GIF
  const handleSelectGif = async (gif: CuratedGif) => {
    if (!user) return;
    const allowed = spamLimiter.checkMessage(gif.url, true);
    if (!allowed) {
      setIsGifModalOpen(false);
      return;
    }

    setIsGifModalOpen(false);
    try {
      const newMsg = await sendMessage({
        senderId: user.id,
        sender: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
        },
        content: gif.title,
        messageType: 'gif',
        mediaUrl: gif.url,
        mediaMeta: { filename: `${gif.title}.gif` },
      });
      spamLimiter.recordMediaSend();
      setMessages((prev) => [...prev, newMsg]);
    } catch (err) {
      Alert.alert('Error', 'Failed to send GIF.');
    }
  };

  // Send Photo, Video, or Audio URL
  const handleSendMedia = async (type: 'photo' | 'video' | 'voice', url: string, filename: string, duration?: number) => {
    if (!user || !url) return;
    const allowed = spamLimiter.checkMessage(url, true);
    if (!allowed) {
      setIsAttachModalOpen(false);
      return;
    }

    setIsAttachModalOpen(false);
    setCustomMediaUrl('');
    setCustomMediaName('');

    try {
      const newMsg = await sendMessage({
        senderId: user.id,
        sender: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
        },
        content: type === 'photo' ? 'Photo Attachment' : type === 'video' ? 'Video Recording' : 'Voice Message',
        messageType: type,
        mediaUrl: url,
        mediaMeta: {
          filename,
          duration: duration || (type === 'video' ? 15 : undefined),
        },
      });
      spamLimiter.recordMediaSend();
      setMessages((prev) => [...prev, newMsg]);
    } catch (err) {
      Alert.alert('Error', `Failed to send ${type}.`);
    }
  };

  // Send Document
  const handleSendDocument = async (doc: DocumentAttachment) => {
    if (!user) return;
    const allowed = spamLimiter.checkMessage(doc.name, true);
    if (!allowed) {
      setIsAttachModalOpen(false);
      return;
    }

    setIsAttachModalOpen(false);
    setCustomMediaUrl('');
    setCustomMediaName('');

    try {
      const newMsg = await sendMessage({
        senderId: user.id,
        sender: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
        },
        content: doc.name,
        messageType: 'document',
        mediaUrl: doc.url,
        mediaMeta: {
          filename: doc.name,
          mimeType: doc.mimeType,
        },
      });
      spamLimiter.recordMediaSend();
      setMessages((prev) => [...prev, newMsg]);
    } catch (err) {
      Alert.alert('Error', 'Failed to send document.');
    }
  };



  // Create Poll
  const handleCreatePoll = async () => {
    if (!user) return;
    const q = pollQuestion.trim();
    const validOptions = pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);

    if (q.length === 0) {
      Alert.alert('Missing Question', 'Please enter a question for the poll.');
      return;
    }
    if (validOptions.length < 2) {
      Alert.alert('Insufficient Options', 'Please provide at least 2 options for members to vote on.');
      return;
    }

    const allowed = spamLimiter.checkMessage(q, false);
    if (!allowed) {
      setIsPollModalOpen(false);
      return;
    }

    setIsPollModalOpen(false);
    setPollQuestion('');
    setPollOptions(['', '']);

    try {
      const newMsg = await createPoll({
        senderId: user.id,
        sender: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
        },
        question: q,
        options: validOptions,
      });
      setMessages((prev) => [...prev, newMsg]);
    } catch (err) {
      Alert.alert('Error', 'Failed to create poll.');
    }
  };

  // Vote on Poll
  const handleVote = async (pollId: string, optionIndex: number) => {
    if (!user) return;

    // Optimistically update vote in state
    setMessages((prev) =>
      prev.map((m) => {
        if (m.poll && m.poll.id === pollId) {
          const votes = [...m.poll.votes];
          const existingIdx = votes.findIndex((v) => v.voter_id === user.id);
          if (existingIdx >= 0) {
            votes[existingIdx] = { ...votes[existingIdx], option_index: optionIndex };
          } else {
            votes.push({
              id: `temp-vote-${Date.now()}`,
              poll_id: pollId,
              voter_id: user.id,
              option_index: optionIndex,
            });
          }
          return { ...m, poll: { ...m.poll, votes } };
        }
        return m;
      })
    );

    await voteOnPoll(pollId, optionIndex, user.id);
  };

  // Message Pin Toggle
  const handleTogglePin = async (msg: MessageWithSender) => {
    setIsActionModalOpen(false);
    const newPin = !msg.is_pinned;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, is_pinned: newPin } : m))
    );
    await togglePinMessage(msg.id, msg.is_pinned);
  };

  // Message Deletion (Soft Delete)
  const handleDeleteMessage = async (msg: MessageWithSender) => {
    setIsActionModalOpen(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? { ...m, is_deleted: true, content: '🚫 This message was deleted' }
          : m
      )
    );
    await deleteMessage(msg.id);
  };

  // Submit Offense Report
  const handleSubmitReport = async () => {
    if (!selectedMessage || !user) return;
    setIsSubmittingReport(true);
    const reasonText = reportReasonDetails.trim().length > 0
      ? `${reportReasonCategory}: ${reportReasonDetails.trim()}`
      : reportReasonCategory;

    await reportOffense({
      messageId: selectedMessage.id,
      reporterId: user.id,
      reportedUserId: selectedMessage.sender_id,
      reason: reasonText,
    });

    setIsSubmittingReport(false);
    setIsReportModalOpen(false);
    setReportReasonDetails('');
    setSelectedMessage(null);
    Alert.alert('Report Filed', 'Thank you. Administrators have been notified to review this message.');
  };

  // Quick jump to pinned message
  const jumpToMessage = (messageId: string) => {
    const reversed = [...messages].reverse();
    const idx = reversed.findIndex((m) => m.id === messageId);
    if (idx >= 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    }
  };

  // ─── Filter Pinned Messages ────────────────────────────────
  const pinnedMessages = messages.filter((m) => m.is_pinned && !m.is_deleted);

  // ─── Message Long Press ────────────────────────────────────
  const onLongPressMessage = (item: MessageWithSender) => {
    if (item.is_deleted) return;
    setSelectedMessage(item);
    setIsActionModalOpen(true);
  };

  // ─── Poll Option Counter Helper ─────────────────────────────
  const renderPollCard = (msg: MessageWithSender) => {
    const poll = msg.poll;
    if (!poll) return null;

    const totalVotes = poll.votes?.length || 0;
    const userVote = poll.votes?.find((v) => v.voter_id === user?.id);

    return (
      <View style={[styles.pollCard, { backgroundColor: isDark ? '#0A1218' : '#F8FAFC', borderColor: colors.border }]}>
        <View style={styles.pollHeader}>
          <Text style={[styles.pollIcon, { color: colors.primary }]}>📊</Text>
          <Text style={[styles.pollQuestion, { color: colors.textPrimary }]}>{poll.question}</Text>
        </View>

        <View style={styles.pollOptionsContainer}>
          {poll.options.map((opt, idx) => {
            const count = poll.votes?.filter((v) => v.option_index === idx).length || 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const isMyChoice = userVote?.option_index === idx;

            return (
              <TouchableOpacity
                key={idx}
                id={`poll-opt-${idx}`}
                style={[
                  styles.pollOptionBtn,
                  {
                    borderColor: isMyChoice ? colors.primary : colors.border,
                    backgroundColor: isMyChoice ? (isDark ? '#00FFCC15' : '#00B89415') : 'transparent',
                  },
                ]}
                onPress={() => handleVote(poll.id, idx)}
                activeOpacity={0.7}
              >
                {/* Background progress fill */}
                <View
                  style={[
                    styles.pollProgressFill,
                    {
                      width: `${pct}%`,
                      backgroundColor: isMyChoice ? (isDark ? '#00FFCC25' : '#00B89425') : (isDark ? '#1A2C3860' : '#DCE4EC60'),
                    },
                  ]}
                />

                <View style={styles.pollOptionContent}>
                  <Text style={[styles.pollOptionText, { color: isMyChoice ? colors.primary : colors.textPrimary }]}>
                    {isMyChoice ? '✓ ' : ''}{opt.text}
                  </Text>
                  <Text style={[styles.pollOptionStats, { color: isMyChoice ? colors.primary : colors.textSecondary }]}>
                    {count} ({pct}%)
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.pollFooter}>
          <Text style={[styles.pollTotalText, { color: colors.textSecondary }]}>
            {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} total
          </Text>
          {userVote && (
            <Text style={[styles.pollVotedBadge, { color: colors.primary }]}>
              • You voted
            </Text>
          )}
        </View>
      </View>
    );
  };

  // ─── Render Single Message Bubble ───────────────────────────
  const renderMessageItem = ({ item }: { item: MessageWithSender }) => {
    const isMe = item.sender_id === user?.id;
    const isSenderAdmin = item.sender?.username === 'admin';

    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => onLongPressMessage(item)}
          delayLongPress={300}
          style={[
            styles.bubbleContainer,
            isMe
              ? [styles.bubbleMe, { backgroundColor: isDark ? '#112230' : '#E6F4F1', borderColor: colors.primary }]
              : [styles.bubbleOther, { backgroundColor: isDark ? '#0D161E' : '#FFFFFF', borderColor: colors.border }],
            item.is_pinned && styles.pinnedBubbleBorder,
          ]}
        >
          {/* Header row: Author + Timestamp + Pin indicator */}
          <View style={styles.bubbleHeader}>
            <View style={styles.bubbleAuthorWrap}>
              <Text style={[styles.bubbleAuthor, { color: isMe ? colors.primary : colors.textPrimary }]}>
                {item.sender?.display_name || (item.sender?.username ? `@${item.sender.username}` : 'User')}
              </Text>
              {isSenderAdmin && (
                <View style={[styles.adminTag, { backgroundColor: colors.primary }]}>
                  <Text style={styles.adminTagText}>ADMIN</Text>
                </View>
              )}
            </View>

            <View style={styles.bubbleMetaRight}>
              {item.is_pinned && (
                <Text style={styles.pinnedBadgeIcon}>📌</Text>
              )}
              <Text style={[styles.bubbleTime, { color: colors.textSecondary }]}>
                {formatTime(item.created_at)}
              </Text>
            </View>
          </View>

          {/* Deleted state */}
          {item.is_deleted ? (
            <Text style={[styles.deletedText, { color: colors.textSecondary }]}>
              {item.content}
            </Text>
          ) : (
            <>
              {/* Type 1: Standard Text Message with Hyperlink Support */}
              {item.message_type === 'text' && (
                <HyperlinkText
                  text={item.content}
                  style={[styles.messageTextBody, { color: colors.textPrimary }]}
                  linkStyle={{ color: '#00FFCC', textDecorationLine: 'underline' }}
                />
              )}

              {/* Type 2: GIF */}
              {item.message_type === 'gif' && item.media_url && (
                <View style={styles.mediaContainer}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setZoomImageUrl(item.media_url)}
                  >
                    <Image
                      source={{ uri: item.media_url }}
                      style={styles.gifImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                  <View style={[styles.gifBadge, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.gifBadgeText, { color: colors.primary }]}>GIF</Text>
                  </View>
                </View>
              )}

              {/* Type 3: Photo with Tap to Zoom */}
              {item.message_type === 'photo' && item.media_url && (
                <View style={styles.mediaContainer}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setZoomImageUrl(item.media_url)}
                  >
                    <Image
                      source={{ uri: item.media_url }}
                      style={styles.photoImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                  <Text style={[styles.photoCaption, { color: colors.textSecondary }]}>
                    🔍 Tap image to zoom
                  </Text>
                </View>
              )}

              {/* Type 4: Video Playback Card (Zero-Crash System Video Player) */}
              {item.message_type === 'video' && item.media_url && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.videoCard, { backgroundColor: isDark ? '#050A0E' : '#E8EFF5' }]}
                  onPress={() => {
                    if (item.media_url) {
                      Linking.openURL(item.media_url).catch(() => {
                        Alert.alert('Cannot Open Video', 'Unable to open video player.');
                      });
                    }
                  }}
                >
                  <View style={styles.videoThumbnailSim}>
                    <View style={styles.videoPlayCircle}>
                      <Text style={styles.videoPlayOverlay}>▶</Text>
                    </View>
                    <Text style={styles.videoTapToPlayText}>Tap to play in system player ↗</Text>
                  </View>
                  <View style={styles.videoInfo}>
                    <Text style={[styles.videoTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.media_meta?.filename || 'video.mp4'}
                    </Text>
                    <Text style={[styles.videoDuration, { color: colors.textSecondary }]}>
                      🎬 Video Recording {item.media_meta?.duration ? `• ${item.media_meta.duration}s` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Type 5: Voice Note Card (Zero-Crash System Audio Player) */}
              {item.message_type === 'voice' && (
                <TouchableOpacity
                  id={`play-voice-${item.id}`}
                  activeOpacity={0.85}
                  style={[styles.voiceCard, { backgroundColor: isDark ? '#071017' : '#F1F5F8' }]}
                  onPress={() => {
                    if (item.media_url) {
                      Linking.openURL(item.media_url).catch(() => {
                        Alert.alert('Cannot Open Audio', 'Unable to play this audio link.');
                      });
                    } else {
                      Alert.alert('Audio Unavailable', 'No media URL provided for this voice note.');
                    }
                  }}
                >
                  <View style={[styles.voicePlayBtn, { backgroundColor: colors.primary }]}>
                    <Text style={styles.voicePlayIcon}>▶</Text>
                  </View>

                  <View style={styles.voiceWaveContainer}>
                    <View style={styles.voiceBars}>
                      {Array.from({ length: 14 }).map((_, bIdx) => (
                        <View
                          key={bIdx}
                          style={[
                            styles.voiceWaveBar,
                            {
                              height: 6 + ((bIdx * 7) % 18),
                              backgroundColor: colors.primary,
                            },
                          ]}
                        />
                      ))}
                    </View>

                    <View style={styles.voiceTimerRow}>
                      <Text style={[styles.voiceTimerText, { color: colors.textSecondary }]}>
                        {item.media_meta?.duration
                          ? `0:${item.media_meta.duration.toString().padStart(2, '0')}`
                          : 'Voice Note'}
                      </Text>
                      <Text style={[styles.voiceBadge, { color: colors.primary }]}>
                        🎤 Play Audio ↗
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}

              {/* Type 6: Document Attachment */}
              {item.message_type === 'document' && (
                <View style={[styles.docCard, { backgroundColor: isDark ? '#071017' : '#F1F5F8', borderColor: colors.border }]}>
                  <View style={styles.docIconWrap}>
                    <Text style={styles.docEmoji}>
                      {item.media_meta?.filename?.endsWith('.pdf') ? '📄' : item.media_meta?.mimeType?.includes('audio') ? '🎵' : '📝'}
                    </Text>
                  </View>

                  <View style={styles.docInfo}>
                    <Text style={[styles.docName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.media_meta?.filename || item.content}
                    </Text>
                    <Text style={[styles.docMetaText, { color: colors.textSecondary }]}>
                      {item.media_meta?.mimeType?.split('/')[1]?.toUpperCase() || 'DOCUMENT'} • {formatFileSize(1850000)}
                    </Text>

                    {item.media_url && (
                      <TouchableOpacity
                        id={`open-doc-${item.id}`}
                        style={[styles.docOpenBtn, { borderColor: colors.primary }]}
                        onPress={() => Linking.openURL(item.media_url!)}
                      >
                        <Text style={[styles.docOpenBtnText, { color: colors.primary }]}>
                          Download / Open File
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* Type 7: Interactive Poll */}
              {item.message_type === 'poll' && renderPollCard(item)}
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // ─────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.mainBackground }]}>
      {/* ── Chat Header ── */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerHash, { color: colors.primary }]}>#</Text>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>egsm-general</Text>
        </View>

        <View style={styles.headerStatusRow}>
          <View style={[styles.statusDot, { backgroundColor: isLive ? colors.primary : '#FFB800' }]} />
          <Text style={[styles.statusText, { color: colors.textSecondary }]}>
            {isLive ? 'LIVE' : 'Local Sync'}
          </Text>
          {pinnedMessages.length > 0 && (
            <TouchableOpacity
              id="pinned-toggle-btn"
              style={[styles.pinnedHeaderBadge, { borderColor: colors.accent }]}
              onPress={() => setIsPinnedBannerExpanded((prev) => !prev)}
            >
              <Text style={[styles.pinnedHeaderBadgeText, { color: colors.accent }]}>
                📌 {pinnedMessages.length} Pinned {isPinnedBannerExpanded ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Sticky Pinned Messages Banner ── */}
      {pinnedMessages.length > 0 && (
        <View style={[styles.pinnedBannerContainer, { backgroundColor: colors.surface, borderLeftColor: colors.accent }]}>
          <TouchableOpacity
            style={styles.pinnedBannerHeader}
            onPress={() => setIsPinnedBannerExpanded((prev) => !prev)}
            activeOpacity={0.8}
          >
            <Text style={styles.pinnedIcon}>📌</Text>
            <View style={styles.pinnedSummaryTextWrap}>
              <Text style={[styles.pinnedBannerTitle, { color: colors.accent }]}>
                Pinned Announcement ({pinnedMessages.length})
              </Text>
              {!isPinnedBannerExpanded && (
                <Text style={[styles.pinnedBannerSnippet, { color: colors.textSecondary }]} numberOfLines={1}>
                  {pinnedMessages[0].content}
                </Text>
              )}
            </View>
            <Text style={[styles.pinnedBannerToggleIcon, { color: colors.accent }]}>
              {isPinnedBannerExpanded ? '▲ Hide' : '▼ Show'}
            </Text>
          </TouchableOpacity>

          {isPinnedBannerExpanded && (
            <ScrollView style={styles.pinnedExpandedList} nestedScrollEnabled={true}>
              {pinnedMessages.map((pMsg) => (
                <View key={pMsg.id} style={[styles.pinnedItemCard, { borderBottomColor: colors.border }]}>
                  <View style={styles.pinnedItemContent}>
                    <Text style={[styles.pinnedAuthor, { color: colors.primary }]}>
                      @{pMsg.sender?.username || 'member'}:
                    </Text>
                    <Text style={[styles.pinnedBody, { color: colors.textPrimary }]} numberOfLines={2}>
                      {pMsg.content}
                    </Text>
                  </View>
                  <View style={styles.pinnedActionRow}>
                    <TouchableOpacity
                      style={[styles.pinnedActionJump, { backgroundColor: isDark ? '#1A2C38' : '#DCE4EC' }]}
                      onPress={() => jumpToMessage(pMsg.id)}
                    >
                      <Text style={[styles.pinnedActionJumpText, { color: colors.primary }]}>Jump</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pinnedActionUnpin, { borderColor: colors.accent }]}
                      onPress={() => handleTogglePin(pMsg)}
                    >
                      <Text style={[styles.pinnedActionUnpinText, { color: colors.accent }]}>Unpin</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── Spam Engine Alert / Warning Banners ── */}
      {/* 1. Duplicate Message Blocked Toast */}
      {spamLimiter.toastMessage && (
        <View style={[styles.toastBanner, { backgroundColor: colors.accent }]}>
          <Text style={styles.toastText}>⚠️ {spamLimiter.toastMessage}</Text>
          <TouchableOpacity onPress={spamLimiter.clearToast} style={styles.toastDismiss}>
            <Text style={styles.toastDismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 2. Warning Lockout Banner (3s lockout) */}
      {spamLimiter.muteLevel === 'warning' && (
        <View style={[styles.warningBanner, { backgroundColor: colors.accent }]}>
          <Text style={styles.warningBannerText}>
            ⚠️ Rate Limit Warning: Send locked for {spamLimiter.remainingSeconds}s. Please slow down!
          </Text>
        </View>
      )}

      {/* 3. Soft Mute Banner (30s) */}
      {spamLimiter.muteLevel === 'soft' && (
        <View style={[styles.muteBanner, { backgroundColor: '#FF6600' }]}>
          <Text style={styles.muteBannerText}>
            🔇 Soft Muted (Excessive speed): Chat input locked for {spamLimiter.remainingSeconds}s.
          </Text>
        </View>
      )}

      {/* 4. Hard Mute Banner (300s) */}
      {spamLimiter.muteLevel === 'hard' && (
        <View style={[styles.muteBanner, { backgroundColor: colors.danger }]}>
          <Text style={styles.muteBannerText}>
            🚨 HARD MUTED: Input locked for {spamLimiter.remainingSeconds}s (5 min). Admin action logged.
          </Text>
        </View>
      )}

      {/* 5. Admin Mute Banner */}
      {spamLimiter.muteLevel === 'admin' && (
        <View style={[styles.muteBanner, { backgroundColor: colors.danger }]}>
          <Text style={styles.muteBannerText}>
            ⛔ Muted by Administrator: Chat input locked ({spamLimiter.remainingSeconds}s remaining).
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: '#050A0E' }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* ── Message Stream Container (Strictly Defined Viewport Height) ── */}
        <View style={styles.messageStreamContainer}>
          {isLoading ? (
            <View style={styles.loadingArea}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading chat stream...</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={reversedMessages}
              inverted={true}
              keyExtractor={(item) => item.id}
              renderItem={renderMessageItem}
              contentContainerStyle={styles.flatListContentContainer}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={true}
              removeClippedSubviews={false}
              overScrollMode="always"
              onScroll={handleScroll}
              scrollEventThrottle={16}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyEmoji]}>💬</Text>
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No messages yet</Text>
                  <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                    Be the first to start the conversation!
                  </Text>
                </View>
              }
            />
          )}
        </View>

        {/* ── Media Cooldown Indicator ── */}
        {spamLimiter.mediaLocked && (
          <View style={[styles.mediaCooldownBar, { backgroundColor: isDark ? '#1C1200' : '#FFF5E6', borderColor: colors.accent }]}>
            <Text style={[styles.mediaCooldownText, { color: colors.accent }]}>
              ⏳ Media Cooldown Active: {spamLimiter.mediaRemainingSeconds}s remaining (max 4 per 60s)
            </Text>
          </View>
        )}

        {/* ── Standard Input Toolbar & Composer ── */}
        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          {/* Quick Attachment Buttons */}
          <View style={styles.toolsRow}>
            {/* Paperclip / Attach Drawer */}
            <TouchableOpacity
              id="attach-media-btn"
              style={[
                styles.toolBtn,
                {
                  borderColor: spamLimiter.mediaLocked ? colors.border : colors.primary,
                  opacity: spamLimiter.mediaLocked || spamLimiter.isInputLocked ? 0.4 : 1,
                },
              ]}
              disabled={spamLimiter.mediaLocked || spamLimiter.isInputLocked}
              onPress={() => setIsAttachModalOpen(true)}
            >
              <Text style={styles.toolIcon}>📎</Text>
            </TouchableOpacity>

            {/* GIF Button */}
            <TouchableOpacity
              id="gif-modal-btn"
              style={[
                styles.toolBtn,
                {
                  borderColor: spamLimiter.mediaLocked ? colors.border : colors.accent,
                  opacity: spamLimiter.mediaLocked || spamLimiter.isInputLocked ? 0.4 : 1,
                },
              ]}
              disabled={spamLimiter.mediaLocked || spamLimiter.isInputLocked}
              onPress={() => setIsGifModalOpen(true)}
            >
              <Text style={[styles.toolGifText, { color: colors.accent }]}>GIF</Text>
            </TouchableOpacity>

            {/* Poll Button */}
            <TouchableOpacity
              id="create-poll-btn"
              style={[
                styles.toolBtn,
                {
                  borderColor: colors.primary,
                  opacity: spamLimiter.isInputLocked ? 0.4 : 1,
                },
              ]}
              disabled={spamLimiter.isInputLocked}
              onPress={() => setIsPollModalOpen(true)}
            >
              <Text style={styles.toolIcon}>📊</Text>
            </TouchableOpacity>

            {/* Microphone / Voice Note Maintenance Button */}
            <TouchableOpacity
              id="record-voice-btn"
              style={[
                styles.toolBtn,
                {
                  borderColor: colors.border,
                  opacity: 0.6,
                },
              ]}
              onPress={() => {
                Alert.alert('Voice Notes', 'Voice notes are currently in maintenance.');
              }}
            >
              <Text style={styles.toolIcon}>🎤</Text>
            </TouchableOpacity>
          </View>

            {/* Text Input Row */}
            <View style={styles.composerRow}>
              <TextInput
                id="chat-message-input"
                style={[
                  styles.textInput,
                  {
                    backgroundColor: isDark ? '#050A0E' : '#F4F7F9',
                    borderColor: colors.border,
                    color: colors.textPrimary,
                  },
                ]}
                placeholder={
                  spamLimiter.isInputLocked
                    ? `Chat input locked (${spamLimiter.remainingSeconds}s remaining)`
                    : 'Type a message or paste a link...'
                }
                placeholderTextColor={colors.textSecondary}
                value={inputText}
                onChangeText={setInputText}
                editable={!spamLimiter.isInputLocked}
                multiline={false}
                onSubmitEditing={handleSendText}
                returnKeyType="send"
              />

              <TouchableOpacity
                id="chat-send-btn"
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity:
                      spamLimiter.isInputLocked ||
                      spamLimiter.sendLocked ||
                      inputText.trim().length === 0
                        ? 0.4
                        : 1,
                  },
                ]}
                disabled={
                  spamLimiter.isInputLocked ||
                  spamLimiter.sendLocked ||
                  inputText.trim().length === 0
                }
                onPress={handleSendText}
              >
                <Text style={styles.sendBtnText}>
                  {spamLimiter.sendLocked ? `${spamLimiter.remainingSeconds}s` : '➤'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
      </KeyboardAvoidingView>

      {/* ─────────────────────────────────────────────────────────
          MODALS
      ────────────────────────────────────────────────────────── */}

      {/* 1. Long-Press Message Action Menu Modal */}
      <Modal
        visible={isActionModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsActionModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsActionModalOpen(false)}
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.actionSheetTitle, { color: colors.textSecondary }]}>
              Message Actions
            </Text>

            {selectedMessage && (
              <View style={[styles.actionSheetSnippet, { backgroundColor: isDark ? '#050A0E' : '#F4F7F9' }]}>
                <Text style={[styles.actionSheetSnippetAuthor, { color: colors.primary }]}>
                  @{selectedMessage.sender?.username}:
                </Text>
                <Text style={[styles.actionSheetSnippetText, { color: colors.textPrimary }]} numberOfLines={2}>
                  {selectedMessage.content}
                </Text>
              </View>
            )}

            {/* Pin / Unpin Button */}
            {selectedMessage && (
              <TouchableOpacity
                id="modal-pin-btn"
                style={[styles.actionItem, { borderBottomColor: colors.border }]}
                onPress={() => handleTogglePin(selectedMessage)}
              >
                <Text style={styles.actionItemIcon}>
                  {selectedMessage.is_pinned ? '📍' : '📌'}
                </Text>
                <Text style={[styles.actionItemText, { color: colors.textPrimary }]}>
                  {selectedMessage.is_pinned ? 'Unpin from Top' : 'Pin to Top of Chat'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Report Offense to Admins */}
            {selectedMessage && (
              <TouchableOpacity
                id="modal-report-btn"
                style={[styles.actionItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setIsActionModalOpen(false);
                  setIsReportModalOpen(true);
                }}
              >
                <Text style={styles.actionItemIcon}>🚨</Text>
                <Text style={[styles.actionItemText, { color: colors.accent }]}>
                  Report Offense to Admins
                </Text>
              </TouchableOpacity>
            )}

            {/* Delete Message (Author or Admin) */}
            {selectedMessage &&
              (selectedMessage.sender_id === user?.id || user?.role === 'admin') && (
                <TouchableOpacity
                  id="modal-delete-btn"
                  style={[styles.actionItem, { borderBottomColor: colors.border }]}
                  onPress={() => handleDeleteMessage(selectedMessage)}
                >
                  <Text style={styles.actionItemIcon}>🗑️</Text>
                  <Text style={[styles.actionItemText, { color: colors.danger }]}>
                    Delete Message
                  </Text>
                </TouchableOpacity>
              )}

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.actionCancelBtn}
              onPress={() => setIsActionModalOpen(false)}
            >
              <Text style={[styles.actionCancelText, { color: colors.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 2. Report Offense Modal */}
      <Modal
        visible={isReportModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsReportModalOpen(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlayCenter} behavior="padding">
          <View style={[styles.dialogCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.dialogHeader}>
              <Text style={[styles.dialogTitle, { color: colors.danger }]}>
                🚨 Report Offense
              </Text>
              <TouchableOpacity onPress={() => setIsReportModalOpen(false)}>
                <Text style={[styles.dialogClose, { color: colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.dialogSubtitle, { color: colors.textSecondary }]}>
              Reporting message from @{selectedMessage?.sender?.username || 'user'}.
            </Text>

            {/* Category selection */}
            <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Offense Category</Text>
            <View style={styles.categoryWrap}>
              {[
                'Spam or Promotion',
                'Harassment or Hate',
                'Inappropriate Media',
                'Scam or Malicious Link',
                'Other Violation',
              ].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.catChip,
                    {
                      borderColor: reportReasonCategory === cat ? colors.accent : colors.border,
                      backgroundColor:
                        reportReasonCategory === cat ? (isDark ? '#FF660020' : '#FF660015') : 'transparent',
                    },
                  ]}
                  onPress={() => setReportReasonCategory(cat)}
                >
                  <Text
                    style={[
                      styles.catChipText,
                      { color: reportReasonCategory === cat ? colors.accent : colors.textPrimary },
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Details input */}
            <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Additional Details</Text>
            <TextInput
              id="report-details-input"
              style={[
                styles.dialogTextInput,
                {
                  backgroundColor: isDark ? '#050A0E' : '#F4F7F9',
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="Explain the violation for administrators..."
              placeholderTextColor={colors.textSecondary}
              value={reportReasonDetails}
              onChangeText={setReportReasonDetails}
              multiline={true}
              numberOfLines={3}
            />

            <View style={styles.dialogButtonRow}>
              <TouchableOpacity
                style={[styles.dialogBtnSecondary, { borderColor: colors.border }]}
                onPress={() => setIsReportModalOpen(false)}
              >
                <Text style={[styles.dialogBtnSecondaryText, { color: colors.textSecondary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                id="submit-report-btn"
                style={[styles.dialogBtnPrimary, { backgroundColor: colors.danger }]}
                disabled={isSubmittingReport}
                onPress={handleSubmitReport}
              >
                {isSubmittingReport ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.dialogBtnPrimaryText}>Submit Report</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 3. Giphy & Reaction GIF Search Modal */}
      <Modal
        visible={isGifModalOpen}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setIsGifModalOpen(false)}
      >
        <View style={[styles.fullModalContainer, { backgroundColor: colors.mainBackground }]}>
          <View style={[styles.fullModalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Text style={[styles.fullModalTitle, { color: colors.accent }]}>
              🎉 Reaction GIFs
            </Text>
            <TouchableOpacity onPress={() => setIsGifModalOpen(false)} style={styles.closeModalBtn}>
              <Text style={[styles.closeModalBtnText, { color: colors.textPrimary }]}>✕ Close</Text>
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={styles.gifSearchBox}>
            <TextInput
              id="giphy-search-input"
              style={[
                styles.gifSearchInput,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="Search Giphy or reactions..."
              placeholderTextColor={colors.textSecondary}
              value={gifSearchQuery}
              onChangeText={setGifSearchQuery}
            />
          </View>

          {/* Categories */}
          <ScrollView
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gifCategoriesRow}
          >
            {['All', 'Reactions', 'Celebration', 'Crypto', 'Hype'].map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.gifCatBtn,
                  {
                    borderColor: gifCategory === cat ? colors.accent : colors.border,
                    backgroundColor: gifCategory === cat ? (isDark ? '#FF660025' : '#FF660015') : colors.surface,
                  },
                ]}
                onPress={() => setGifCategory(cat)}
              >
                <Text style={[styles.gifCatText, { color: gifCategory === cat ? colors.accent : colors.textPrimary }]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* GIF Grid */}
          {isLoadingGifs ? (
            <View style={styles.loadingArea}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading GIFs...</Text>
            </View>
          ) : (
            <FlatList
              data={giphyResults}
              numColumns={2}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.gifGrid}
              renderItem={({ item }) => (
                <TouchableOpacity
                  id={`gif-item-${item.id}`}
                  style={[styles.gifCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => handleSelectGif(item)}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: item.url }} style={styles.gifThumbnail} resizeMode="cover" />
                  <Text style={[styles.gifCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* 4. Attachment Drawer Modal (Photos, Videos, Documents) */}
      <Modal
        visible={isAttachModalOpen}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setIsAttachModalOpen(false)}
      >
        <View style={[styles.fullModalContainer, { backgroundColor: colors.mainBackground }]}>
          <View style={[styles.fullModalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Text style={[styles.fullModalTitle, { color: colors.primary }]}>
              📎 Attach Media & Documents
            </Text>
            <TouchableOpacity onPress={() => setIsAttachModalOpen(false)} style={styles.closeModalBtn}>
              <Text style={[styles.closeModalBtnText, { color: colors.textPrimary }]}>✕ Close</Text>
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={[styles.attachTabBar, { backgroundColor: colors.surface }]}>
            {(['photo', 'video', 'audio', 'doc'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.attachTabBtn,
                  attachTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 3 },
                ]}
                onPress={() => setAttachTab(tab)}
              >
                <Text
                  style={[
                    styles.attachTabBtnText,
                    { color: attachTab === tab ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {tab === 'photo' ? '📷 Photo' : tab === 'video' ? '🎬 Video' : tab === 'audio' ? '🎤 Audio' : '📄 Doc'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={styles.attachModalBody}>
            {/* TAB 1: Photo */}
            {attachTab === 'photo' && (
              <View style={styles.attachSection}>
                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
                  Attach Photo / Image URL
                </Text>
                <Text style={[{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }]}>
                  Paste any direct image link (.png, .jpg, .webp, .gif) to share in group chat.
                </Text>
                <TextInput
                  style={[styles.urlInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                  placeholder="https://example.com/photo.jpg"
                  placeholderTextColor={colors.textSecondary}
                  value={customMediaUrl}
                  onChangeText={setCustomMediaUrl}
                  autoCapitalize="none"
                />

                {customMediaUrl.trim().length > 6 && (
                  <View style={{ marginTop: 14, alignItems: 'center' }}>
                    <Text style={[{ color: colors.textSecondary, fontSize: 11, marginBottom: 6, fontWeight: '600' }]}>
                      Live Image Preview
                    </Text>
                    <Image
                      source={{ uri: customMediaUrl.trim() }}
                      style={{ width: '100%', height: 180, borderRadius: 8, backgroundColor: '#050A0E' }}
                      resizeMode="contain"
                    />
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.customSendBtn, { backgroundColor: colors.primary, opacity: customMediaUrl.trim() ? 1 : 0.4 }]}
                  disabled={!customMediaUrl.trim()}
                  onPress={() => handleSendMedia('photo', customMediaUrl.trim(), 'photo.jpg')}
                >
                  <Text style={styles.customSendBtnText}>Send Photo</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* TAB 2: Video */}
            {attachTab === 'video' && (
              <View style={styles.attachSection}>
                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
                  Attach Video URL
                </Text>
                <Text style={[{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }]}>
                  Paste any direct video stream or MP4 URL. Members can tap to watch in system player.
                </Text>
                <TextInput
                  style={[styles.urlInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                  placeholder="https://example.com/video.mp4"
                  placeholderTextColor={colors.textSecondary}
                  value={customMediaUrl}
                  onChangeText={setCustomMediaUrl}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[styles.customSendBtn, { backgroundColor: colors.primary, opacity: customMediaUrl.trim() ? 1 : 0.4 }]}
                  disabled={!customMediaUrl.trim()}
                  onPress={() => handleSendMedia('video', customMediaUrl.trim(), 'video.mp4', 15)}
                >
                  <Text style={styles.customSendBtnText}>Send Video URL</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* TAB 3: Audio */}
            {attachTab === 'audio' && (
              <View style={styles.attachSection}>
                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
                  Attach Audio / Voice Note URL
                </Text>
                <Text style={[{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }]}>
                  Paste any direct audio link (.mp3, .m4a, .wav, or podcast clip).
                </Text>
                <TextInput
                  style={[styles.urlInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                  placeholder="https://example.com/audio.mp3"
                  placeholderTextColor={colors.textSecondary}
                  value={customMediaUrl}
                  onChangeText={setCustomMediaUrl}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[styles.customSendBtn, { backgroundColor: colors.primary, opacity: customMediaUrl.trim() ? 1 : 0.4 }]}
                  disabled={!customMediaUrl.trim()}
                  onPress={() => handleSendMedia('voice', customMediaUrl.trim(), 'audio.mp3', 15)}
                >
                  <Text style={styles.customSendBtnText}>Send Audio Note</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* TAB 4: Document */}
            {attachTab === 'doc' && (
              <View style={styles.attachSection}>
                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
                  Attach Document Link (PDF, Doc, Archive)
                </Text>
                <Text style={[{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }]}>
                  Enter the file title and direct URL. Members can download or view it in their device viewer.
                </Text>
                <TextInput
                  style={[styles.urlInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                  placeholder="Document Name (e.g. Audit_Log.pdf)"
                  placeholderTextColor={colors.textSecondary}
                  value={customMediaName}
                  onChangeText={setCustomMediaName}
                />
                <TextInput
                  style={[styles.urlInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary, marginTop: 8 }]}
                  placeholder="https://example.com/file.pdf"
                  placeholderTextColor={colors.textSecondary}
                  value={customMediaUrl}
                  onChangeText={setCustomMediaUrl}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[
                    styles.customSendBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: customMediaUrl.trim() && customMediaName.trim() ? 1 : 0.4,
                    },
                  ]}
                  disabled={!customMediaUrl.trim() || !customMediaName.trim()}
                  onPress={() =>
                    handleSendDocument({
                      name: customMediaName.trim(),
                      url: customMediaUrl.trim(),
                      mimeType: customMediaName.trim().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
                      size: 1024 * 512,
                    })
                  }
                >
                  <Text style={styles.customSendBtnText}>Send Document Link</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* 5. Create Poll Modal */}
      <Modal
        visible={isPollModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsPollModalOpen(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlayCenter} behavior="padding">
          <View style={[styles.dialogCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.dialogHeader}>
              <Text style={[styles.dialogTitle, { color: colors.primary }]}>
                📊 Create Community Poll
              </Text>
              <TouchableOpacity onPress={() => setIsPollModalOpen(false)}>
                <Text style={[styles.dialogClose, { color: colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Poll Question</Text>
            <TextInput
              id="poll-question-input"
              style={[
                styles.dialogTextInput,
                {
                  backgroundColor: isDark ? '#050A0E' : '#F4F7F9',
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="e.g. Upgrade node cluster to v2.5?"
              placeholderTextColor={colors.textSecondary}
              value={pollQuestion}
              onChangeText={setPollQuestion}
            />

            <Text style={[styles.inputLabel, { color: colors.textPrimary, marginTop: 12 }]}>
              Options (2 to 5)
            </Text>
            {pollOptions.map((opt, idx) => (
              <View key={idx} style={styles.pollOptionInputRow}>
                <TextInput
                  id={`poll-option-input-${idx}`}
                  style={[
                    styles.pollInput,
                    {
                      backgroundColor: isDark ? '#050A0E' : '#F4F7F9',
                      borderColor: colors.border,
                      color: colors.textPrimary,
                    },
                  ]}
                  placeholder={`Option ${idx + 1}`}
                  placeholderTextColor={colors.textSecondary}
                  value={opt}
                  onChangeText={(val) => {
                    const copy = [...pollOptions];
                    copy[idx] = val;
                    setPollOptions(copy);
                  }}
                />
                {pollOptions.length > 2 && (
                  <TouchableOpacity
                    style={styles.pollRemoveOptBtn}
                    onPress={() => {
                      setPollOptions(pollOptions.filter((_, i) => i !== idx));
                    }}
                  >
                    <Text style={{ color: colors.danger, fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {pollOptions.length < 5 && (
              <TouchableOpacity
                style={[styles.addOptBtn, { borderColor: colors.primary }]}
                onPress={() => setPollOptions([...pollOptions, ''])}
              >
                <Text style={[styles.addOptBtnText, { color: colors.primary }]}>+ Add Option</Text>
              </TouchableOpacity>
            )}

            <View style={styles.dialogButtonRow}>
              <TouchableOpacity
                style={[styles.dialogBtnSecondary, { borderColor: colors.border }]}
                onPress={() => setIsPollModalOpen(false)}
              >
                <Text style={[styles.dialogBtnSecondaryText, { color: colors.textSecondary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                id="submit-create-poll-btn"
                style={[styles.dialogBtnPrimary, { backgroundColor: colors.primary }]}
                onPress={handleCreatePoll}
              >
                <Text style={styles.dialogBtnPrimaryText}>Publish Poll</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 6. Full-Screen Image Zoom Modal */}
      <Modal
        visible={!!zoomImageUrl}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setZoomImageUrl(null)}
      >
        <View style={styles.zoomModalContainer}>
          <TouchableOpacity
            style={styles.zoomCloseBtn}
            onPress={() => setZoomImageUrl(null)}
          >
            <Text style={styles.zoomCloseText}>✕ Close Preview</Text>
          </TouchableOpacity>
          {zoomImageUrl && (
            <Image
              source={{ uri: zoomImageUrl }}
              style={styles.zoomImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050A0E',
  },
  messageStreamContainer: {
    flex: 1,
    backgroundColor: '#050A0E',
  },
  flatListContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerHash: {
    fontSize: 20,
    fontWeight: '800',
    marginRight: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pinnedHeaderBadge: {
    marginLeft: 10,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pinnedHeaderBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Pinned Messages Banner ──
  pinnedBannerContainer: {
    borderLeftWidth: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2C38',
  },
  pinnedBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pinnedIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  pinnedSummaryTextWrap: {
    flex: 1,
  },
  pinnedBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pinnedBannerSnippet: {
    fontSize: 12,
    marginTop: 2,
  },
  pinnedBannerToggleIcon: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 8,
  },
  pinnedExpandedList: {
    maxHeight: 180,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  pinnedItemCard: {
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  pinnedItemContent: {
    marginBottom: 4,
  },
  pinnedAuthor: {
    fontSize: 12,
    fontWeight: '700',
  },
  pinnedBody: {
    fontSize: 13,
    marginTop: 2,
  },
  pinnedActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  pinnedActionJump: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  pinnedActionJumpText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pinnedActionUnpin: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  pinnedActionUnpinText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Spam Limiter Banners ──
  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
  },
  toastText: {
    color: '#050A0E',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  toastDismiss: {
    paddingLeft: 8,
  },
  toastDismissText: {
    color: '#050A0E',
    fontSize: 14,
    fontWeight: '800',
  },
  warningBanner: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  warningBannerText: {
    color: '#050A0E',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  muteBanner: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  muteBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  mediaCooldownBar: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  mediaCooldownText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },

  // ── Message Stream ──
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  loadingArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: 13,
    marginTop: 4,
  },

  // ── Bubbles ──
  messageRow: {
    marginVertical: 4,
    flexDirection: 'row',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  bubbleContainer: {
    maxWidth: '85%',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  bubbleMe: {
    borderTopRightRadius: 2,
  },
  bubbleOther: {
    borderTopLeftRadius: 2,
  },
  pinnedBubbleBorder: {
    borderLeftWidth: 3,
    borderLeftColor: '#FF6600',
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  bubbleAuthorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bubbleAuthor: {
    fontSize: 12,
    fontWeight: '700',
  },
  adminTag: {
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginLeft: 6,
  },
  adminTagText: {
    color: '#050A0E',
    fontSize: 9,
    fontWeight: '800',
  },
  bubbleMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  pinnedBadgeIcon: {
    fontSize: 11,
    marginRight: 4,
  },
  bubbleTime: {
    fontSize: 10,
    fontWeight: '500',
  },
  deletedText: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  messageTextBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  linkText: {
    textDecorationLine: 'underline',
    fontWeight: '600',
  },

  // ── GIF / Photo ──
  mediaContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 4,
  },
  gifImage: {
    width: 230,
    height: 160,
    borderRadius: 8,
  },
  gifBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gifBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  photoImage: {
    width: 230,
    height: 160,
    borderRadius: 8,
  },
  photoCaption: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },

  // ── Video Card ──
  videoCard: {
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 4,
    width: 240,
  },
  videoThumbnailSim: {
    height: 100,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 255, 204, 0.2)',
    borderWidth: 1,
    borderColor: '#00FFCC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  videoPlayOverlay: {
    color: '#00FFCC',
    fontSize: 18,
    marginLeft: 2,
  },
  videoTapToPlayText: {
    color: '#7E8E9C',
    fontSize: 10,
    fontWeight: '600',
  },
  videoInfo: {
    padding: 8,
  },
  videoTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  videoDuration: {
    fontSize: 11,
    marginTop: 2,
  },
  videoOpenBtn: {
    marginTop: 8,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  videoOpenBtnText: {
    color: '#050A0E',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Voice Card ──
  voiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
    width: 230,
  },
  voicePlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  voicePlayIcon: {
    color: '#050A0E',
    fontSize: 14,
    fontWeight: '800',
  },
  voiceWaveContainer: {
    flex: 1,
  },
  voiceBars: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    justifyContent: 'space-between',
  },
  voiceWaveBar: {
    width: 3,
    borderRadius: 1.5,
  },
  voiceTimerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  voiceTimerText: {
    fontSize: 10,
    fontWeight: '600',
  },
  voiceBadge: {
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Document Card ──
  docCard: {
    flexDirection: 'row',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
    width: 240,
  },
  docIconWrap: {
    marginRight: 10,
    justifyContent: 'center',
  },
  docEmoji: {
    fontSize: 26,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: 13,
    fontWeight: '700',
  },
  docMetaText: {
    fontSize: 11,
    marginTop: 2,
  },
  docOpenBtn: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  docOpenBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Poll Card ──
  pollCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginTop: 4,
    width: 250,
  },
  pollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pollIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  pollQuestion: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  pollOptionsContainer: {
    marginVertical: 4,
  },
  pollOptionBtn: {
    borderWidth: 1,
    borderRadius: 6,
    marginVertical: 3,
    overflow: 'hidden',
    position: 'relative',
    height: 34,
    justifyContent: 'center',
  },
  pollProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  pollOptionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    zIndex: 1,
  },
  pollOptionText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  pollOptionStats: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 6,
  },
  pollFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  pollTotalText: {
    fontSize: 10,
    fontWeight: '500',
  },
  pollVotedBadge: {
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 6,
  },

  // ── Input & Tools ──
  inputBar: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
    borderTopWidth: 1,
  },
  toolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  toolBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  toolIcon: {
    fontSize: 15,
  },
  toolGifText: {
    fontSize: 10,
    fontWeight: '800',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    fontSize: 14,
    borderWidth: 1,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    color: '#050A0E',
    fontSize: 16,
    fontWeight: '800',
  },

  // ── Recording Bar ──
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  recordingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3366',
    marginRight: 6,
  },
  recordingText: {
    color: '#FF3366',
    fontSize: 12,
    fontWeight: '800',
    marginRight: 8,
  },
  recordingTimer: {
    fontSize: 14,
    fontWeight: '700',
  },
  recordingActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 10,
  },
  recordingCancelText: {
    fontSize: 12,
    fontWeight: '600',
  },
  recordingSendBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  recordingSendText: {
    color: '#050A0E',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Modals & Action Sheets ──
  modalOverlay: {
    flex: 1,
    paddingTop: SAFE_TOP,
    backgroundColor: '#00000080',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  actionSheetTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  actionSheetSnippet: {
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  actionSheetSnippetAuthor: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionSheetSnippetText: {
    fontSize: 12,
    marginTop: 2,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  actionItemIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  actionItemText: {
    fontSize: 15,
    fontWeight: '600',
  },
  actionCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  actionCancelText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Dialog Cards (Report / Poll) ──
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: '#00000085',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    paddingTop: TOP_SAFE_PADDING,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  dialogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  dialogClose: {
    fontSize: 18,
    fontWeight: '700',
    padding: 4,
  },
  dialogSubtitle: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  catChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginRight: 6,
    marginBottom: 6,
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dialogTextInput: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    marginBottom: 12,
  },
  dialogButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  dialogBtnSecondary: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginRight: 8,
  },
  dialogBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dialogBtnPrimary: {
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBtnPrimaryText: {
    color: '#050A0E',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Poll inputs ──
  pollOptionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  pollInput: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  pollRemoveOptBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginLeft: 4,
  },
  addOptBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    marginVertical: 6,
  },
  addOptBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Full Screen Modals (Giphy / Attach) ──
  fullModalContainer: {
    flex: 1,
    paddingTop: TOP_SAFE_PADDING,
  },
  fullModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  fullModalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  closeModalBtn: {
    padding: 4,
  },
  closeModalBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  gifSearchBox: {
    padding: 12,
  },
  gifSearchInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  gifCategoriesRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  gifCatBtn: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
  },
  gifCatText: {
    fontSize: 12,
    fontWeight: '700',
  },
  gifGrid: {
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  gifCard: {
    flex: 0.5,
    margin: 4,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  gifThumbnail: {
    width: '100%',
    height: 120,
  },
  gifCardTitle: {
    fontSize: 11,
    fontWeight: '600',
    padding: 6,
  },

  // ── Attach Drawer ──
  attachTabBar: {
    flexDirection: 'row',
  },
  attachTabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  attachTabBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  attachModalBody: {
    flex: 1,
    padding: 16,
  },
  attachSection: {
    marginBottom: 24,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  presetThumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 10,
  },
  videoPresetIcon: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#050A0E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  docPresetIcon: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#050A0E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  presetInfo: {
    flex: 1,
  },
  presetLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  presetSub: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  urlInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  customSendBtn: {
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  customSendBtnText: {
    color: '#050A0E',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Zoom Modal ──
  zoomModalContainer: {
    flex: 1,
    paddingTop: SAFE_TOP,
    backgroundColor: '#000000F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomCloseBtn: {
    position: 'absolute',
    top: TOP_SAFE_PADDING,
    right: 20,
    zIndex: 10,
    backgroundColor: '#1A2C38',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  zoomCloseText: {
    color: '#00FFCC',
    fontSize: 13,
    fontWeight: '700',
  },
  zoomImage: {
    width: '94%',
    height: '75%',
  },
  uploadingMediaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  uploadingMediaText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalUploadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalUploadingText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default ChatScreen;
