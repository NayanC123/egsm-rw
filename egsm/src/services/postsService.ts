// src/services/postsService.ts
// Service handling Posts, Post Ratings (0–10), Announcements, and Leaderboard.
// Writes directly to Supabase with strict column naming and immediate error alerts.
// STRICT ANTI-CRASH & SAFETY: No delete operations exist in this service.

import { Alert } from 'react-native';
import { supabase } from './supabase';
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
// Core Service Methods
// ─────────────────────────────────────────────────────────────

/**
 * Fetch all posts with author details, ratings, satisfaction rates, and myRating.
 * Announcements are automatically sorted to the top.
 */
export async function fetchPosts(currentUserId?: string): Promise<DetailedPost[]> {
  try {
    const { data: postsData, error: postsError } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (postsError || !postsData) {
      Alert.alert(
        'Sync Error: fetchPosts',
        `${postsError?.message || 'Failed to fetch posts'} (${postsError?.code || 'FETCH_ERR'})`
      );
      return [];
    }

    // Fetch all profiles from Supabase to guarantee real usernames and display names
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

    const { data: ratingsData } = await supabase
      .from('post_ratings')
      .select('*');

    const allRatings = (ratingsData as any[]) || [];

    const detailed: DetailedPost[] = postsData.map((p: any) => {
      const postRatings: RatingWithRater[] = allRatings
        .filter((r) => r.post_id === p.id)
        .map((r) => {
          const raterProf = profileMap.get(r.rater_id) || profileMap.get(String(r.rater_id).toLowerCase());
          const raterDisplayName =
            (raterProf?.display_name && raterProf.display_name.trim()) ||
            (raterProf?.username && `@${raterProf.username}`) ||
            (r.rater_id ? `@${String(r.rater_id).slice(0, 10)}` : 'User');

          return {
            id: r.id,
            post_id: r.post_id,
            rater_id: r.rater_id,
            score: r.score,
            created_at: r.created_at,
            rater: {
              id: r.rater_id,
              username: raterProf?.username || 'user',
              display_name: raterDisplayName,
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

      const authorProf = profileMap.get(p.author_id) || profileMap.get(String(p.author_id).toLowerCase());
      const authorDisplayName =
        (authorProf?.display_name && authorProf.display_name.trim()) ||
        (authorProf?.username && `@${authorProf.username}`) ||
        (p.author?.display_name && p.author.display_name.trim()) ||
        (p.author?.username && `@${p.author.username}`) ||
        (p.author_id ? `@${String(p.author_id).slice(0, 10)}` : 'User');

      const author = {
        id: p.author_id,
        username: authorProf?.username || p.author?.username || 'user',
        display_name: authorDisplayName,
      };

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
  } catch (err: any) {
    Alert.alert('Sync Error: fetchPosts', err?.message || 'Failed to fetch posts from database.');
    return [];
  }
}

export interface CreatePostParams {
  author_id: string;
  author?: Pick<Profile, 'id' | 'username' | 'display_name'>;
  subject: string;
  content: string;
  image_urls: string[];
  document_urls: DocumentAttachment[];
  is_announcement?: boolean;
}

export async function createPost(
  params: CreatePostParams
): Promise<{ success: boolean; post?: Post & { author?: Pick<Profile, 'id' | 'username' | 'display_name'> }; error?: string }> {
  const cleanSubject = params.subject.trim();
  const cleanContent = params.content.trim();

  if (!cleanSubject) {
    Alert.alert('Validation Error', 'Post subject is required.');
    return { success: false, error: 'Post subject is required.' };
  }
  if (!cleanContent) {
    Alert.alert('Validation Error', 'Post content cannot be empty.');
    return { success: false, error: 'Post content cannot be empty.' };
  }

  try {
    const { data, error } = await supabase
      .from('posts')
      .insert({
        author_id: params.author_id,
        subject: cleanSubject,
        content: cleanContent,
        image_urls: params.image_urls || [],
        document_urls: params.document_urls || [],
        is_announcement: Boolean(params.is_announcement),
      })
      .select()
      .single();

    if (error) {
      Alert.alert('Sync Error: createPost', `${error.message} (${error.code})`);
      return { success: false, error: error.message };
    }

    if (data) {
      return { success: true, post: { ...(data as Post), author: params.author } };
    }
    return { success: false, error: 'Failed to create post.' };
  } catch (err: any) {
    Alert.alert('Sync Error: createPost', err?.message || 'Failed to create post in database.');
    return { success: false, error: err?.message || 'Failed to create post.' };
  }
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
    Alert.alert('Validation Error', 'Score must be an integer between 0 and 10.');
    return { success: false, error: 'Score must be an integer between 0 and 10.' };
  }

  try {
    const { error } = await supabase.from('post_ratings').upsert(
      {
        post_id: post_id,
        rater_id: rater.id,
        score: score,
      },
      { onConflict: 'post_id,rater_id' }
    );

    if (error) {
      Alert.alert('Sync Error: ratePost', `${error.message} (${error.code})`);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    Alert.alert('Sync Error: ratePost', err?.message || 'Failed to submit rating.');
    return { success: false, error: err?.message || 'Failed to submit rating.' };
  }
}

/**
 * Admin action: Mark or Unmark post as an Announcement.
 */
export async function toggleAnnouncement(
  postId: string,
  isAnnouncement: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('posts')
      .update({ is_announcement: isAnnouncement })
      .eq('id', postId);

    if (error) {
      Alert.alert('Sync Error: toggleAnnouncement', `${error.message} (${error.code})`);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    Alert.alert('Sync Error: toggleAnnouncement', err?.message || 'Failed to update announcement.');
    return { success: false, error: err?.message || 'Failed to update announcement.' };
  }
}

/**
 * Compute the Community Leaderboard.
 * QUALIFICATION CRITERIA: Minimum 1 post per week (>= 1 post in rolling last 7 days).
 * Any member with 0 posts in the last 7 days is automatically excluded.
 */
export async function computeLeaderboard(): Promise<LeaderboardEntry[]> {
  const posts = await fetchPosts();

  // Query real profiles from Supabase to guarantee real display names
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, username, display_name');

  const profileMap = new Map<string, Pick<Profile, 'id' | 'username' | 'display_name'>>();
  (profilesData || []).forEach((p: any) => {
    profileMap.set(p.id, p);
    if (p.username) {
      profileMap.set(p.username.toLowerCase(), p);
    }
  });

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

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
      const prof = profileMap.get(authorId) || profileMap.get(String(authorId).toLowerCase()) || p.author;
      const authorDisplayName =
        (prof?.display_name && prof.display_name.trim()) ||
        (prof?.username && `@${prof.username}`) ||
        (authorId ? `@${String(authorId).slice(0, 10)}` : 'User');
      const authorUsername = prof?.username || 'user';

      stat = {
        profile: {
          id: prof?.id || authorId,
          username: authorUsername,
          display_name: authorDisplayName,
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
