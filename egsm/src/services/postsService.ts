// src/services/postsService.ts
// Service handling Posts, Post Ratings (0–10), Announcements, and Leaderboard.
// Full dual-mode support: Supabase live database + in-memory localStore fallback.
// STRICT ANTI-CRASH & SAFETY: No delete operations exist in this service.

import { supabase, isSupabaseConfigured } from './supabase';
import { localStore } from '../context/AuthContext';
import type {
  Post,
  PostRating,
  PostWithDetails,
  DocumentAttachment,
  LeaderboardEntry,
  Profile,
} from '../types/database';

export interface RatingWithRater extends PostRating {
  rater?: Pick<Profile, 'id' | 'username' | 'display_name'>;
}

export interface DetailedPost extends Omit<PostWithDetails, 'ratings'> {
  ratings: RatingWithRater[];
}

// ─────────────────────────────────────────────────────────────
// Initial Seed Data for Local Fallback Store
// ─────────────────────────────────────────────────────────────

const now = Date.now();
const oneDayMs = 24 * 60 * 60 * 1000;

let _localPosts: Post[] = [
  {
    id: 'post-001',
    author_id: 'local-admin-000',
    subject: '📢 Welcome to egsm. Community Platform Guidelines & Rating Standards',
    content:
      'Welcome everyone to egsm.! Please remember that all posts made on this network are permanent and immutable. Once published, your posts will be viewed by all active members and evaluated on a strict 0–10 Satisfaction Rating scale.\n\nKeep contributions respectful, high-value, and focused on community growth. You can attach images and whitepapers directly from the toolbar below.',
    image_urls: [
      'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80',
    ],
    document_urls: [
      {
        name: 'egsm._Platform_Charter_v1.0.pdf',
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        mimeType: 'application/pdf',
        size: 1258291,
      },
    ],
    is_announcement: true,
    created_at: new Date(now - 2 * oneDayMs).toISOString(),
  },
  {
    id: 'post-002',
    author_id: 'local-member-001',
    subject: 'Decentralized State Caching Architecture & Benchmark Analysis',
    content:
      'Over the past week, we evaluated multiple caching strategies to minimize edge latencies across our regional nodes. By leveraging local persistence and delta synchronization, we observed an 82% reduction in initial cold-start query overhead.\n\nAttached are the benchmark graphs and complete architectural specification for review. Please rate and provide your thoughts!',
    image_urls: [
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80',
    ],
    document_urls: [
      {
        name: 'Node_Benchmarking_Report.pdf',
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        mimeType: 'application/pdf',
        size: 2490368,
      },
      {
        name: 'Audio_Walkthrough_Discussion.m4a',
        url: 'https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg',
        mimeType: 'audio/m4a',
        size: 3840120,
      },
    ],
    is_announcement: false,
    created_at: new Date(now - 1 * oneDayMs).toISOString(),
  },
  {
    id: 'post-003',
    author_id: 'local-admin-000',
    subject: 'Quarterly Infrastructure Roadmap & Validator Node Expansion',
    content:
      'We are rolling out upgraded validator nodes next Tuesday at 02:00 UTC. Zero downtime is expected. Read the attached schedule and let us know if your node operators have any questions.',
    image_urls: [
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
    ],
    document_urls: [
      {
        name: 'Validator_Upgrade_Schedule.pdf',
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        mimeType: 'application/pdf',
        size: 542000,
      },
    ],
    is_announcement: false,
    created_at: new Date(now - 3 * oneDayMs).toISOString(),
  },
];

let _localRatings: RatingWithRater[] = [
  {
    id: 'rating-001',
    post_id: 'post-001',
    rater_id: 'local-member-001',
    score: 10,
    created_at: new Date(now - 1.5 * oneDayMs).toISOString(),
    rater: {
      id: 'local-member-001',
      username: 'member1',
      display_name: 'Test Member',
    },
  },
  {
    id: 'rating-002',
    post_id: 'post-002',
    rater_id: 'local-admin-000',
    score: 9,
    created_at: new Date(now - 18 * 60 * 60 * 1000).toISOString(),
    rater: {
      id: 'local-admin-000',
      username: 'admin',
      display_name: 'Administrator',
    },
  },
  {
    id: 'rating-003',
    post_id: 'post-003',
    rater_id: 'local-member-001',
    score: 8,
    created_at: new Date(now - 2.5 * oneDayMs).toISOString(),
    rater: {
      id: 'local-member-001',
      username: 'member1',
      display_name: 'Test Member',
    },
  },
];

// ─────────────────────────────────────────────────────────────
// Core Service Methods
// ─────────────────────────────────────────────────────────────

/**
 * Fetch all posts with author details, ratings, satisfaction rates, and myRating.
 * Announcements are automatically sorted to the top.
 */
export async function fetchPosts(currentUserId?: string): Promise<DetailedPost[]> {
  if (isSupabaseConfigured) {
    try {
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*, author:profiles!author_id(id, username, display_name)')
        .order('created_at', { ascending: false });

      if (postsError || !postsData) {
        console.warn('Supabase fetchPosts error, falling back to local store:', postsError);
        return getLocalPostsWithDetails(currentUserId);
      }

      const { data: ratingsData } = await supabase
        .from('post_ratings')
        .select('*, rater:profiles!rater_id(id, username, display_name)');

      const allRatings = (ratingsData as any[]) || [];

      const detailed: DetailedPost[] = postsData.map((p: any) => {
        const postRatings: RatingWithRater[] = allRatings
          .filter((r) => r.post_id === p.id)
          .map((r) => ({
            id: r.id,
            post_id: r.post_id,
            rater_id: r.rater_id,
            score: r.score,
            created_at: r.created_at,
            rater: r.rater || {
              id: r.rater_id,
              username: 'unknown',
              display_name: 'Member',
            },
          }));

        const count = postRatings.length;
        const totalScore = postRatings.reduce((sum, r) => sum + r.score, 0);
        const averageRating = count > 0 ? totalScore / count : null;
        const satisfactionRate = averageRating !== null ? (averageRating / 10) * 100 : null;
        const myRating = currentUserId
          ? postRatings.find((r) => r.rater_id === currentUserId) || null
          : null;

        const author = p.author || {
          id: p.author_id,
          username: 'author',
          display_name: 'Member',
        };

        return {
          id: p.id,
          author_id: p.author_id,
          subject: p.subject,
          content: p.content,
          image_urls: p.image_urls || [],
          document_urls: p.document_urls || [],
          is_announcement: Boolean(p.is_announcement),
          created_at: p.created_at,
          author,
          ratings: postRatings,
          averageRating,
          satisfactionRate,
          myRating,
        };
      });

      // Pinned announcements always come first, then newest first
      detailed.sort((a, b) => {
        if (a.is_announcement && !b.is_announcement) return -1;
        if (!a.is_announcement && b.is_announcement) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      return detailed;
    } catch (err) {
      console.warn('fetchPosts exception, falling back to local store:', err);
      return getLocalPostsWithDetails(currentUserId);
    }
  }

  return getLocalPostsWithDetails(currentUserId);
}

/** Local store computation helper */
function getLocalPostsWithDetails(currentUserId?: string): DetailedPost[] {
  const profiles = localStore.getProfiles();
  const profileMap = new Map<string, Profile>(profiles.map((p) => [p.id, p]));

  const detailed: DetailedPost[] = _localPosts.map((p) => {
    const authorProfile = profileMap.get(p.author_id);
    const author = {
      id: p.author_id,
      username: authorProfile?.username || 'member',
      display_name: authorProfile?.display_name || 'Community Member',
    };

    const postRatings = _localRatings
      .filter((r) => r.post_id === p.id)
      .map((r) => {
        const raterProfile = profileMap.get(r.rater_id);
        return {
          ...r,
          rater: r.rater || {
            id: r.rater_id,
            username: raterProfile?.username || 'member',
            display_name: raterProfile?.display_name || 'Member',
          },
        };
      });

    const count = postRatings.length;
    const totalScore = postRatings.reduce((sum, r) => sum + r.score, 0);
    const averageRating = count > 0 ? totalScore / count : null;
    const satisfactionRate = averageRating !== null ? (averageRating / 10) * 100 : null;
    const myRating = currentUserId
      ? postRatings.find((r) => r.rater_id === currentUserId) || null
      : null;

    return {
      ...p,
      author,
      ratings: postRatings,
      averageRating,
      satisfactionRate,
      myRating,
    };
  });

  // Pinned announcements always come first, then newest first
  detailed.sort((a, b) => {
    if (a.is_announcement && !b.is_announcement) return -1;
    if (!a.is_announcement && b.is_announcement) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return detailed;
}

/**
 * Publish a new permanent post.
 * STRICT ENFORCEMENT: Posts cannot be deleted once created.
 */
export async function createPost(params: {
  author_id: string;
  subject: string;
  content: string;
  image_urls: string[];
  document_urls: DocumentAttachment[];
  is_announcement?: boolean;
}): Promise<{ success: boolean; post?: Post; error?: string }> {
  const cleanSubject = params.subject.trim();
  const cleanContent = params.content.trim();

  if (!cleanSubject) {
    return { success: false, error: 'Post subject is required.' };
  }
  if (!cleanContent) {
    return { success: false, error: 'Post content cannot be empty.' };
  }

  const newPost: Post = {
    id: `post-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    author_id: params.author_id,
    subject: cleanSubject,
    content: cleanContent,
    image_urls: params.image_urls,
    document_urls: params.document_urls,
    is_announcement: Boolean(params.is_announcement),
    created_at: new Date().toISOString(),
  };

  // Always keep in local store for instantaneous UI transitions
  _localPosts = [newPost, ..._localPosts];

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          author_id: params.author_id,
          subject: cleanSubject,
          content: cleanContent,
          image_urls: params.image_urls,
          document_urls: params.document_urls,
          is_announcement: Boolean(params.is_announcement),
        })
        .select()
        .single();

      if (error) {
        console.warn('Supabase createPost error (local cache preserved):', error);
        return { success: true, post: newPost };
      }

      if (data) {
        return { success: true, post: data as Post };
      }
    } catch (err: any) {
      console.warn('createPost exception (local cache preserved):', err);
    }
  }

  return { success: true, post: newPost };
}

/**
 * Submit or update a 0–10 rating for a post.
 */
export async function ratePost(params: {
  post_id: string;
  rater: Pick<Profile, 'id' | 'username' | 'display_name'>;
  score: number;
}): Promise<{ success: boolean; error?: string }> {
  const { post_id, rater, score } = params;

  if (score < 0 || score > 10 || !Number.isInteger(score)) {
    return { success: false, error: 'Score must be an integer between 0 and 10.' };
  }

  // Update local cache
  const existingIndex = _localRatings.findIndex(
    (r) => r.post_id === post_id && r.rater_id === rater.id
  );

  const newRatingRecord: RatingWithRater = {
    id: existingIndex >= 0 ? _localRatings[existingIndex].id : `rating-${Date.now()}`,
    post_id,
    rater_id: rater.id,
    score,
    created_at: new Date().toISOString(),
    rater,
  };

  if (existingIndex >= 0) {
    _localRatings[existingIndex] = newRatingRecord;
  } else {
    _localRatings.push(newRatingRecord);
  }

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('post_ratings').upsert(
        {
          post_id,
          rater_id: rater.id,
          score,
        },
        { onConflict: 'post_id,rater_id' }
      );

      if (error) {
        console.warn('Supabase ratePost error (local cache updated):', error);
      }
    } catch (err) {
      console.warn('ratePost exception (local cache updated):', err);
    }
  }

  return { success: true };
}

/**
 * Admin action: Mark or Unmark post as an Announcement.
 */
export async function toggleAnnouncement(
  postId: string,
  isAnnouncement: boolean
): Promise<{ success: boolean; error?: string }> {
  // Update local cache
  _localPosts = _localPosts.map((p) =>
    p.id === postId ? { ...p, is_announcement: isAnnouncement } : p
  );

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('posts')
        .update({ is_announcement: isAnnouncement })
        .eq('id', postId);

      if (error) {
        console.warn('Supabase toggleAnnouncement error:', error);
        return { success: false, error: error.message };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update announcement.' };
    }
  }

  return { success: true };
}

/**
 * Compute the Community Leaderboard.
 * QUALIFICATION CRITERIA: Minimum 1 post per week (>= 1 post in rolling last 7 days).
 * Any member with 0 posts in the last 7 days is automatically excluded.
 */
export async function computeLeaderboard(): Promise<LeaderboardEntry[]> {
  const posts = await fetchPosts();
  const profiles = localStore.getProfiles();
  const profileMap = new Map<string, Profile>(profiles.map((p) => [p.id, p]));

  const sevenDaysAgo = Date.now() - 7 * oneDayMs;

  // Group posts and calculate metrics per author
  const authorStats = new Map<
    string,
    {
      profile: Pick<Profile, 'id' | 'username' | 'display_name'>;
      totalPosts: number;
      recentPosts: number;
      satisfactionSum: number;
      ratedPostsCount: number;
    }
  >();

  posts.forEach((p) => {
    const authorId = p.author_id;
    let stat = authorStats.get(authorId);
    if (!stat) {
      const profile = profileMap.get(authorId) || p.author;
      stat = {
        profile: {
          id: profile.id,
          username: profile.username,
          display_name: profile.display_name,
        },
        totalPosts: 0,
        recentPosts: 0,
        satisfactionSum: 0,
        ratedPostsCount: 0,
      };
      authorStats.set(authorId, stat);
    }

    stat.totalPosts += 1;
    const postTime = new Date(p.created_at).getTime();
    if (postTime >= sevenDaysAgo) {
      stat.recentPosts += 1;
    }

    if (p.satisfactionRate !== null) {
      stat.satisfactionSum += p.satisfactionRate;
      stat.ratedPostsCount += 1;
    }
  });

  const qualified: LeaderboardEntry[] = [];

  authorStats.forEach((stat) => {
    // Member MUST have at least 1 post in rolling last 7 days
    if (stat.recentPosts >= 1) {
      const avgSatisfaction =
        stat.ratedPostsCount > 0 ? stat.satisfactionSum / stat.ratedPostsCount : 0;

      qualified.push({
        profile: stat.profile,
        satisfactionRate: Math.round(avgSatisfaction * 10) / 10,
        totalPosts: stat.totalPosts,
        recentPosts: stat.recentPosts,
        rank: 0, // Assigned after sorting
      });
    }
  });

  // Sort descending by satisfactionRate, then by recentPosts, then by totalPosts
  qualified.sort((a, b) => {
    if (b.satisfactionRate !== a.satisfactionRate) {
      return b.satisfactionRate - a.satisfactionRate;
    }
    if (b.recentPosts !== a.recentPosts) {
      return b.recentPosts - a.recentPosts;
    }
    return b.totalPosts - a.totalPosts;
  });

  // Assign ranks
  qualified.forEach((entry, idx) => {
    entry.rank = idx + 1;
  });

  return qualified;
}
