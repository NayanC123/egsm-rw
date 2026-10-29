// src/services/chatService.ts
// Supabase Live Database + Realtime chat service with zero local fallbacks.
// Every create/send/update writes directly to Supabase and surfaces errors immediately.

import { Alert } from 'react-native';
import { supabase } from './supabase';
import { encryptMessage, decryptMessage } from '../utils/e2ee';
import type {
  Message,
  Poll,
  PollVote,
  PollOption,
  MessageWithSender,
  MessageType,
  MediaMeta,
  Profile,
} from '../types/database';

// ─── Fetch All Messages ───────────────────────────────────────────────────────

export async function fetchMessages(): Promise<MessageWithSender[]> {
  try {
    const { data: messagesData, error: msgErr } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (msgErr || !messagesData) {
      console.error('Supabase fetchMessages error:', msgErr);
      if (msgErr) {
        Alert.alert('Sync Error: fetchMessages', `${msgErr.message} (${msgErr.code})`);
      }
      return [];
    }

    // Fetch all profiles to map real display names and usernames
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, display_name, role');

    const profileMap = new Map<string, Pick<Profile, 'id' | 'username' | 'display_name' | 'role'>>();
    (profilesData || []).forEach((p: any) => {
      if (p && p.id) {
        profileMap.set(p.id, p);
        profileMap.set(String(p.id).toLowerCase(), p);
      }
      if (p && p.username) {
        profileMap.set(p.username.toLowerCase(), p);
        profileMap.set(p.username, p);
      }
    });

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

    return messagesData.map((m: any) => {
      const senderProf = profileMap.get(m.sender_id) || profileMap.get(String(m.sender_id).toLowerCase());
      const senderDisplayName =
        (senderProf?.display_name && senderProf.display_name.trim()) ||
        (senderProf?.username && `@${senderProf.username}`) ||
        (m.sender?.display_name && m.sender.display_name.trim()) ||
        (m.sender?.username && `@${m.sender.username}`) ||
        (m.sender_id ? `@${String(m.sender_id).slice(0, 10)}` : 'User');

      const sender = {
        id: m.sender_id,
        username: senderProf?.username || m.sender?.username || 'user',
        display_name: senderDisplayName,
      };

      // Decrypt message content using E2EE module
      const rawCipher = m.content || '';
      const decrypted = decryptMessage(rawCipher);

      return {
        ...m,
        content: decrypted.text,
        raw_ciphertext: rawCipher,
        is_encrypted: decrypted.isEncrypted,
        verified: decrypted.verified,
        sender,
        poll: pollsMap.get(m.id),
      };
    });
  } catch (e: any) {
    console.error('Supabase fetchMessages exception:', e);
    Alert.alert('Sync Error: fetchMessages', `${e?.message || 'Failed to load messages'} (${e?.code || 'UNKNOWN'})`);
    return [];
  }
}

// ─── Send Text or Media Message ───────────────────────────────────────────────

export interface SendMessageParams {
  senderId: string;
  sender?: Pick<Profile, 'id' | 'username' | 'display_name'>;
  content: string;
  messageType?: MessageType;
  mediaUrl?: string | null;
  mediaMeta?: MediaMeta;
}

export async function sendMessage(params: SendMessageParams): Promise<MessageWithSender> {
  const { senderId, sender, content, messageType = 'text', mediaUrl = null, mediaMeta = {} } = params;

  try {
    // Encrypt message content before persisting into Supabase
    const ciphertext = encryptMessage(content);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: senderId,
        content: ciphertext,
        message_type: messageType,
        media_url: mediaUrl,
        media_meta: mediaMeta,
        is_pinned: false,
        is_deleted: false,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Supabase sendMessage error:', error);
      Alert.alert('Sync Error', `${error.message} (${error.code})`);
      throw error;
    }

    return {
      ...data,
      content, // Deliver plaintext to UI for immediate feedback
      raw_ciphertext: ciphertext,
      is_encrypted: true,
      verified: true,
      sender: sender || {
        id: senderId,
        username: 'user',
        display_name: senderId ? `@${String(senderId).slice(0, 10)}` : 'User',
      },
    };
  } catch (e: any) {
    console.error('Supabase sendMessage exception:', e);
    if (!e?.code) {
      Alert.alert('Sync Error', `${e?.message || 'Failed to send message'}`);
    }
    throw e;
  }
}

// ─── Create Poll Message ──────────────────────────────────────────────────────

export interface CreatePollParams {
  senderId: string;
  sender?: Pick<Profile, 'id' | 'username' | 'display_name'>;
  question: string;
  options: string[];
}

export async function createPoll(params: CreatePollParams): Promise<MessageWithSender> {
  const { senderId, sender, question, options } = params;
  const pollOptions: PollOption[] = options.map((opt) => ({ text: opt.trim() }));

  const defaultSender: Pick<Profile, 'id' | 'username' | 'display_name'> = sender || {
    id: senderId,
    username: 'user',
    display_name: senderId ? `@${String(senderId).slice(0, 10)}` : 'User',
  };

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
      .select('*')
      .single();

    if (msgErr) {
      console.error('Supabase createPoll message insert error:', msgErr);
      Alert.alert('Sync Error', `${msgErr.message} (${msgErr.code})`);
      throw msgErr;
    }

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

    if (pollErr) {
      console.error('Supabase createPoll polls insert error:', pollErr);
      Alert.alert('Sync Error', `${pollErr.message} (${pollErr.code})`);
      throw pollErr;
    }

    return {
      ...msgData,
      sender: defaultSender,
      poll: {
        ...pollData,
        options: pollOptions,
        votes: [],
      },
    };
  } catch (e: any) {
    console.error('Supabase createPoll error:', e);
    if (!e?.code) {
      Alert.alert('Sync Error', `${e?.message || 'Failed to create poll'}`);
    }
    throw e;
  }
}

// ─── Vote on Poll ─────────────────────────────────────────────────────────────

export async function voteOnPoll(
  pollId: string,
  optionIndex: number,
  voterId: string
): Promise<{ success: boolean; error?: string }> {
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

    if (error) {
      console.error('Supabase voteOnPoll error:', error);
      Alert.alert('Sync Error: voteOnPoll', `${error.message} (${error.code})`);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.error('Supabase voteOnPoll exception:', e);
    Alert.alert('Sync Error: voteOnPoll', `${e?.message || 'Failed to submit vote'} (${e?.code || 'VOTE_ERR'})`);
    return { success: false, error: e?.message || 'Failed to submit vote.' };
  }
}

// ─── Delete Message (Soft Delete) ─────────────────────────────────────────────

export async function deleteMessage(messageId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('messages')
      .update({
        is_deleted: true,
        content: '🚫 This message was deleted',
      })
      .eq('id', messageId);

    if (error) {
      console.error('Supabase deleteMessage error:', error);
      Alert.alert('Sync Error: deleteMessage', `${error.message} (${error.code})`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('Supabase deleteMessage exception:', e);
    Alert.alert('Sync Error: deleteMessage', `${e?.message || 'Failed to delete message'} (${e?.code || 'DELETE_ERR'})`);
    return false;
  }
}

// ─── Toggle Pin Message ───────────────────────────────────────────────────────

export async function togglePinMessage(messageId: string, currentPin: boolean): Promise<boolean> {
  const newPinState = !currentPin;
  try {
    const { error } = await supabase
      .from('messages')
      .update({ is_pinned: newPinState })
      .eq('id', messageId);

    if (error) {
      console.error('Supabase togglePinMessage error:', error);
      Alert.alert('Sync Error: togglePinMessage', `${error.message} (${error.code})`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('Supabase togglePinMessage exception:', e);
    Alert.alert('Sync Error: togglePinMessage', `${e?.message || 'Failed to pin/unpin message'} (${e?.code || 'PIN_ERR'})`);
    return false;
  }
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

  try {
    const { error } = await supabase.from('offense_reports').insert({
      message_id: messageId,
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      reason,
      status: 'pending',
    });

    if (error) {
      console.error('Supabase reportOffense error:', error);
      Alert.alert('Sync Error: reportOffense', `${error.message} (${error.code})`);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.error('Supabase reportOffense exception:', e);
    Alert.alert('Sync Error: reportOffense', `${e?.message || 'Failed to submit report'} (${e?.code || 'REPORT_ERR'})`);
    return { success: false, error: e?.message || 'Failed to submit report.' };
  }
}
