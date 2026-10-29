// src/types/database.ts
// Complete TypeScript interfaces matching every Supabase table.

// ─────────────────────────────────────────────────────────────
// Raw DB Row Types
// ─────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  role: 'admin' | 'member';
  status: 'active' | 'suspended' | 'terminated';
  suspended_until: string | null;
  muted_until: string | null;
  created_at: string;
}

export interface Post {
  id: string;
  author_id: string;
  subject: string;
  content: string;
  image_urls: string[];
  document_urls: DocumentAttachment[];
  is_announcement: boolean;
  created_at: string;
}

export interface PostRating {
  id: string;
  post_id: string;
  rater_id: string;
  score: number; // 0–10
  created_at: string;
}

export type MessageType = 'text' | 'gif' | 'photo' | 'video' | 'voice' | 'document' | 'poll';

export interface MediaMeta {
  filename?: string;
  duration?: number;   // seconds, for voice/video
  mimeType?: string;
  dimensions?: { width: number; height: number };
}

export interface Message {
  id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  media_url: string | null;
  media_meta: MediaMeta;
  is_pinned: boolean;
  is_deleted: boolean;
  created_at: string;
  is_encrypted?: boolean;
  raw_ciphertext?: string;
  verified?: boolean;
}

export interface Poll {
  id: string;
  message_id: string;
  question: string;
  options: PollOption[];
  created_at: string;
}

export interface PollOption {
  text: string;
}

export interface PollVote {
  id: string;
  poll_id: string;
  voter_id: string;
  option_index: number;
}

export interface OffenseReport {
  id: string;
  message_id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
}

export interface PasswordResetRequest {
  id: string;
  username: string;
  request_note: string | null;
  status: 'pending' | 'resolved';
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Attachment Helpers
// ─────────────────────────────────────────────────────────────

export interface DocumentAttachment {
  name: string;
  url: string;
  mimeType: string;
  size: number; // bytes
}

// ─────────────────────────────────────────────────────────────
// Joined / Computed Types for UI Queries
// ─────────────────────────────────────────────────────────────

/** A post row augmented with its author's display info and aggregated rating stats. */
export interface PostWithDetails extends Post {
  author: Pick<Profile, 'id' | 'username' | 'display_name'>;
  ratings: PostRating[];
  /** Arithmetic mean of all `score` values, or null if no ratings yet. */
  averageRating: number | null;
  /** (averageRating / 10) * 100, or null. */
  satisfactionRate: number | null;
  /** The current user's own rating for this post, or null. */
  myRating: PostRating | null;
}

/** A message row augmented with its sender's display info and optional poll data. */
export interface MessageWithSender extends Message {
  sender: Pick<Profile, 'id' | 'username' | 'display_name'>;
  poll?: Poll & { votes: PollVote[] };
}

/** A row in the leaderboard computation. */
export interface LeaderboardEntry {
  profile: Pick<Profile, 'id' | 'username' | 'display_name'>;
  /** Average satisfaction rate across all posts (0–100). */
  satisfactionRate: number;
  /** Total posts authored (all time). */
  totalPosts: number;
  /** Posts authored in the rolling last 7 days (must be >= 1 to appear). */
  recentPosts: number;
  rank: number;
}

/** Supabase table name union — useful for realtime subscription helpers. */
export type TableName =
  | 'profiles'
  | 'posts'
  | 'post_ratings'
  | 'messages'
  | 'polls'
  | 'poll_votes'
  | 'offense_reports'
  | 'password_reset_requests';
