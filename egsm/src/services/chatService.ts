// src/services/chatService.ts
// Dual-mode chat service supporting Supabase Live Database + Realtime subscriptions
// with a complete in-memory localStore fallback.

import { supabase, isSupabaseConfigured } from './supabase';
import { localStore } from '../context/AuthContext';
import type {
  Message,
  Poll,
  PollVote,
  PollOption,
  OffenseReport,
  MessageWithSender,
  MessageType,
  MediaMeta,
  Profile,
} from '../types/database';

// ─── Initial Seed Messages for Local Mode / Cold Boot ─────────────────────────

const now = Date.now();
const minuteMs = 60 * 1000;

let _localMessages: Message[] = [
  {
    id: 'msg-001',
    sender_id: 'local-admin-000',
    content: '📌 Welcome to the EGSM Group Chat! Please maintain constructive discourse. Official documentation: https://docs.egsm.network and source https://github.com/egsm-protocol.',
    message_type: 'text',
    media_url: null,
    media_meta: {},
    is_pinned: true,
    is_deleted: false,
    created_at: new Date(now - 120 * minuteMs).toISOString(),
  },
  {
    id: 'msg-002',
    sender_id: 'local-member-001',
    content: 'Excited for the upcoming upgrade! Anyone testing the new validator benchmark yet?',
    message_type: 'text',
    media_url: null,
    media_meta: {},
    is_pinned: false,
    is_deleted: false,
    created_at: new Date(now - 90 * minuteMs).toISOString(),
  },
  {
    id: 'msg-003',
    sender_id: 'local-admin-000',
    content: 'Here is the system architecture diagram for reference:',
    message_type: 'photo',
    media_url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&auto=format&fit=crop&q=80',
    media_meta: { filename: 'egsm_cluster_topology.png', dimensions: { width: 800, height: 600 } },
    is_pinned: false,
    is_deleted: false,
    created_at: new Date(now - 60 * minuteMs).toISOString(),
  },
  {
    id: 'msg-004',
    sender_id: 'local-admin-000',
    content: 'Community Vote: Which engineering topic should we cover in Friday\'s deep dive?',
    message_type: 'poll',
    media_url: null,
    media_meta: {},
    is_pinned: true,
    is_deleted: false,
    created_at: new Date(now - 45 * minuteMs).toISOString(),
  },
  {
    id: 'msg-005',
    sender_id: 'local-member-001',
    content: 'Voice note detailing testnet sync telemetry:',
    message_type: 'voice',
    media_url: 'https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg',
    media_meta: { duration: 18, filename: 'audio_telemetry_01.m4a' },
    is_pinned: false,
    is_deleted: false,
    created_at: new Date(now - 30 * minuteMs).toISOString(),
  },
  {
    id: 'msg-006',
    sender_id: 'local-admin-000',
    content: 'Validator Operations Runbook v2.4 attached below.',
    message_type: 'document',
    media_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    media_meta: { filename: 'Validator_Runbook_v2.4.pdf', mimeType: 'application/pdf', duration: 0 },
    is_pinned: false,
    is_deleted: false,
    created_at: new Date(now - 15 * minuteMs).toISOString(),
  },
  {
    id: 'msg-007',
    sender_id: 'local-member-001',
    content: 'Let\'s go!',
    message_type: 'gif',
    media_url: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif',
    media_meta: { filename: 'celebrate.gif' },
    is_pinned: false,
    is_deleted: false,
    created_at: new Date(now - 5 * minuteMs).toISOString(),
  },
];

let _localPolls: Poll[] = [
  {
    id: 'poll-001',
    message_id: 'msg-004',
    question: 'Next Community Workshop Topic?',
    options: [
      { text: 'Zero-Knowledge State Proofs' },
      { text: 'Sliding-Window Rate Limiting Engine' },
      { text: 'Consensus Fault Tolerance Benchmarks' },
      { text: 'Distributed Key Generation' },
    ],
    created_at: new Date(now - 45 * minuteMs).toISOString(),
  },
];

let _localPollVotes: PollVote[] = [
  { id: 'vote-001', poll_id: 'poll-001', voter_id: 'local-admin-000', option_index: 1 },
  { id: 'vote-002', poll_id: 'poll-001', voter_id: 'local-member-001', option_index: 1 },
];

let _localOffenseReports: OffenseReport[] = [
  {
    id: 'report-001',
    message_id: 'msg-002',
    reporter_id: 'local-admin-000',
    reported_user_id: 'local-member-001',
    reason: 'Repeated off-topic commercial advertising and spam link submission in main channel.',
    status: 'pending',
    created_at: new Date(now - 75 * minuteMs).toISOString(),
  },
  {
    id: 'report-002',
    message_id: 'msg-007',
    reporter_id: 'local-member-001',
    reported_user_id: 'local-member-002',
    reason: 'Disruptive GIF flooding and abusive reactions during validator voting window.',
    status: 'pending',
    created_at: new Date(now - 20 * minuteMs).toISOString(),
  },
];

// ─── Profile Resolution Helper ────────────────────────────────────────────────

function getSenderInfo(senderId: string): Pick<Profile, 'id' | 'username' | 'display_name'> {
  const profile = localStore.getProfiles().find((p) => p.id === senderId);
  if (profile) {
    return { id: profile.id, username: profile.username, display_name: profile.display_name };
  }
  return { id: senderId, username: 'user', display_name: 'Member' };
}

// ─── Fetch All Messages ───────────────────────────────────────────────────────

export async function fetchMessages(): Promise<MessageWithSender[]> {
  if (isSupabaseConfigured) {
    try {
      const { data: messagesData, error: msgErr } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles(id, username, display_name)
        `)
        .order('created_at', { ascending: true });

      if (msgErr) throw msgErr;

      const { data: pollsData } = await supabase.from('polls').select('*');
      const { data: votesData } = await supabase.from('poll_votes').select('*');

      const pollsMap = new Map<string, Poll & { votes: PollVote[] }>();
      (pollsData || []).forEach((p: any) => {
        const rawOptions = Array.isArray(p.options) ? p.options : [];
        const options: PollOption[] = rawOptions.map((o: any) =>
          typeof o === 'string' ? { text: o } : { text: o?.text || '' }
        );
        const pollObj: Poll = { ...p, options };
        const votes = (votesData || []).filter((v: any) => v.poll_id === p.id);
        pollsMap.set(p.message_id, { ...pollObj, votes });
      });

      return (messagesData || []).map((m: any) => ({
        ...m,
        sender: m.sender || { id: m.sender_id, username: 'user', display_name: 'Member' },
        poll: pollsMap.get(m.id),
      }));
    } catch (e) {
      console.warn('Supabase fetchMessages error, using local store fallback:', e);
    }
  }

  // Local fallback
  return _localMessages.map((m) => {
    const sender = getSenderInfo(m.sender_id);
    const pollRow = _localPolls.find((p) => p.message_id === m.id);
    let poll: (Poll & { votes: PollVote[] }) | undefined;
    if (pollRow) {
      const votes = _localPollVotes.filter((v) => v.poll_id === pollRow.id);
      poll = { ...pollRow, votes };
    }
    return { ...m, sender, poll };
  });
}

// ─── Send Text or Media Message ───────────────────────────────────────────────

export interface SendMessageParams {
  senderId: string;
  content: string;
  messageType?: MessageType;
  mediaUrl?: string | null;
  mediaMeta?: MediaMeta;
}

export async function sendMessage(params: SendMessageParams): Promise<MessageWithSender> {
  const { senderId, content, messageType = 'text', mediaUrl = null, mediaMeta = {} } = params;

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: senderId,
          content,
          message_type: messageType,
          media_url: mediaUrl,
          media_meta: mediaMeta,
          is_pinned: false,
          is_deleted: false,
        })
        .select(`
          *,
          sender:profiles(id, username, display_name)
        `)
        .single();

      if (error) throw error;
      return {
        ...data,
        sender: data.sender || getSenderInfo(senderId),
      };
    } catch (e) {
      console.warn('Supabase sendMessage error, falling back to local store:', e);
    }
  }

  // Local store
  const newMsg: Message = {
    id: `local-msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sender_id: senderId,
    content,
    message_type: messageType,
    media_url: mediaUrl,
    media_meta: mediaMeta,
    is_pinned: false,
    is_deleted: false,
    created_at: new Date().toISOString(),
  };
  _localMessages = [..._localMessages, newMsg];

  return {
    ...newMsg,
    sender: getSenderInfo(senderId),
  };
}

// ─── Create Poll Message ──────────────────────────────────────────────────────

export interface CreatePollParams {
  senderId: string;
  question: string;
  options: string[];
}

export async function createPoll(params: CreatePollParams): Promise<MessageWithSender> {
  const { senderId, question, options } = params;
  const pollOptions: PollOption[] = options.map((opt) => ({ text: opt.trim() }));

  if (isSupabaseConfigured) {
    try {
      // 1. Insert message
      const { data: msgData, error: msgErr } = await supabase
        .from('messages')
        .insert({
          sender_id: senderId,
          content: question,
          message_type: 'poll',
          media_url: null,
          media_meta: {},
          is_pinned: false,
          is_deleted: false,
        })
        .select(`
          *,
          sender:profiles(id, username, display_name)
        `)
        .single();

      if (msgErr) throw msgErr;

      // 2. Insert poll
      const { data: pollData, error: pollErr } = await supabase
        .from('polls')
        .insert({
          message_id: msgData.id,
          question,
          options: pollOptions,
        })
        .select()
        .single();

      if (pollErr) throw pollErr;

      return {
        ...msgData,
        sender: msgData.sender || getSenderInfo(senderId),
        poll: {
          ...pollData,
          options: pollOptions,
          votes: [],
        },
      };
    } catch (e) {
      console.warn('Supabase createPoll error, falling back to local store:', e);
    }
  }

  // Local store
  const msgId = `local-msg-${Date.now()}`;
  const pollId = `local-poll-${Date.now()}`;

  const newMsg: Message = {
    id: msgId,
    sender_id: senderId,
    content: question,
    message_type: 'poll',
    media_url: null,
    media_meta: {},
    is_pinned: false,
    is_deleted: false,
    created_at: new Date().toISOString(),
  };
  _localMessages = [..._localMessages, newMsg];

  const newPoll: Poll = {
    id: pollId,
    message_id: msgId,
    question,
    options: pollOptions,
    created_at: new Date().toISOString(),
  };
  _localPolls = [..._localPolls, newPoll];

  return {
    ...newMsg,
    sender: getSenderInfo(senderId),
    poll: {
      ...newPoll,
      votes: [],
    },
  };
}

// ─── Vote on Poll ─────────────────────────────────────────────────────────────

export async function voteOnPoll(
  pollId: string,
  optionIndex: number,
  voterId: string
): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('poll_votes')
        .upsert(
          {
            poll_id: pollId,
            voter_id: voterId,
            option_index: optionIndex,
          },
          { onConflict: 'poll_id,voter_id' }
        );

      if (error) throw error;
      return { success: true };
    } catch (e: any) {
      console.warn('Supabase voteOnPoll error, falling back to local store:', e);
    }
  }

  // Local store upsert
  const existingIndex = _localPollVotes.findIndex(
    (v) => v.poll_id === pollId && v.voter_id === voterId
  );
  if (existingIndex >= 0) {
    _localPollVotes[existingIndex] = {
      ..._localPollVotes[existingIndex],
      option_index: optionIndex,
    };
  } else {
    _localPollVotes = [
      ..._localPollVotes,
      {
        id: `local-vote-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        poll_id: pollId,
        voter_id: voterId,
        option_index: optionIndex,
      },
    ];
  }
  return { success: true };
}

// ─── Delete Message (Soft Delete) ─────────────────────────────────────────────

export async function deleteMessage(messageId: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('messages')
        .update({
          is_deleted: true,
          content: '🚫 This message was deleted',
        })
        .eq('id', messageId);

      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase deleteMessage error, falling back to local store:', e);
    }
  }

  // Local store
  _localMessages = _localMessages.map((m) =>
    m.id === messageId
      ? { ...m, is_deleted: true, content: '🚫 This message was deleted' }
      : m
  );
  return true;
}

// ─── Toggle Pin Message ───────────────────────────────────────────────────────

export async function togglePinMessage(messageId: string, currentPin: boolean): Promise<boolean> {
  const newPinState = !currentPin;
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_pinned: newPinState })
        .eq('id', messageId);

      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase togglePinMessage error, falling back to local store:', e);
    }
  }

  // Local store
  _localMessages = _localMessages.map((m) =>
    m.id === messageId ? { ...m, is_pinned: newPinState } : m
  );
  return true;
}

// ─── Report Offense to Admins ─────────────────────────────────────────────────

export interface ReportOffenseParams {
  messageId: string;
  reporterId: string;
  reportedUserId: string;
  reason: string;
}

export async function reportOffense(
  params: ReportOffenseParams
): Promise<{ success: boolean; error?: string }> {
  const { messageId, reporterId, reportedUserId, reason } = params;

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('offense_reports').insert({
        message_id: messageId,
        reporter_id: reporterId,
        reported_user_id: reportedUserId,
        reason,
        status: 'pending',
      });

      if (error) throw error;
      return { success: true };
    } catch (e: any) {
      console.warn('Supabase reportOffense error, falling back to local store:', e);
    }
  }

  // Local store
  _localOffenseReports = [
    ..._localOffenseReports,
    {
      id: `local-offense-${Date.now()}`,
      message_id: messageId,
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      reason,
      status: 'pending',
      created_at: new Date().toISOString(),
    },
  ];

  return { success: true };
}

export function getLocalOffenseReports(): OffenseReport[] {
  return _localOffenseReports;
}

export function updateLocalOffenseReportStatus(
  reportId: string,
  newStatus: 'pending' | 'resolved' | 'dismissed'
): void {
  _localOffenseReports = _localOffenseReports.map((r) =>
    r.id === reportId ? { ...r, status: newStatus } : r
  );
}

export function getLocalMessages(): Message[] {
  return _localMessages;
}
