// src/components/Posts/LeaderboardView.tsx
// Phase 4 — Live Leaderboard View with Supabase Realtime subscriptions.
//
// REAL-TIME ENGINE:
//   Subscribes to INSERT/UPDATE on `posts` and `post_ratings` via Supabase Realtime.
//   Triggers a full leaderboard recompute whenever a new post or rating arrives.
//
// STRICT WEEKLY ELIGIBILITY:
//   A user with 0 posts in the rolling last 7 days is COMPLETELY EXCLUDED from the board.
//   Satisfaction Rate = ((Sum of all scores / Count of ratings) / 10) × 100
//   Tie-breaker: higher weekly post count wins.
//
// ANTI-CRASH: ONLY built-in react-native components. No HTML tags. No native libs.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { fetchPosts } from '../../services/postsService';
import { useTheme } from '../../context/ThemeContext';
import { TOP_SAFE_PADDING } from '../../utils/layout';
import type { LeaderboardEntry, Profile } from '../../types/database';

// ─────────────────────────────────────────────────────────────
// Leaderboard Computation (inline, realtime-safe)
// ─────────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Recomputes the leaderboard from scratch using the given posts and ratings.
 *
 * Eligibility rule (CRITICAL):
 *   A user MUST have >= 1 post with created_at >= sevenDaysAgo.
 *   Users with 0 qualifying posts are fully excluded, regardless of their ratings.
 *
 * Satisfaction Rate formula:
 *   For each eligible author, collect ALL their ratings (across all posts).
 *   Satisfaction Rate (%) = ((sum of scores / count of ratings) / 10) * 100
 *   If an author has no ratings at all → 0%
 *
 * Sort: descending satisfactionRate, tie-breaker: higher recentPosts count.
 */
function computeLiveLeaderboard(
  posts: Array<{
    id: string;
    author_id: string;
    created_at: string;
    authorUsername: string;
    authorDisplayName: string;
    ratings: Array<{ score: number }>;
  }>
): LeaderboardEntry[] {
  const sevenDaysAgo = Date.now() - 7 * ONE_DAY_MS;

  // Aggregate per-author stats
  const authorStats = new Map<
    string,
    {
      profile: Pick<Profile, 'id' | 'username' | 'display_name'>;
      totalPosts: number;
      recentPosts: number;
      totalScoreSum: number;
      totalRatingCount: number;
    }
  >();

  posts.forEach((p) => {
    let stat = authorStats.get(p.author_id);
    if (!stat) {
      stat = {
        profile: {
          id: p.author_id,
          username: p.authorUsername,
          display_name: p.authorDisplayName,
        },
        totalPosts: 0,
        recentPosts: 0,
        totalScoreSum: 0,
        totalRatingCount: 0,
      };
      authorStats.set(p.author_id, stat);
    }

    stat.totalPosts += 1;

    // Rolling 7-day window check
    const postTime = new Date(p.created_at).getTime();
    if (postTime >= sevenDaysAgo) {
      stat.recentPosts += 1;
    }

    // Accumulate ratings from ALL posts (not just recent ones)
    p.ratings.forEach((r) => {
      stat!.totalScoreSum += r.score;
      stat!.totalRatingCount += 1;
    });
  });

  const qualified: LeaderboardEntry[] = [];

  authorStats.forEach((stat) => {
    // CRITICAL: exclude users with 0 posts in the rolling 7-day window
    if (stat.recentPosts < 1) return;

    // Satisfaction Rate (%) = ((sumOfRatings / countOfRatings) / 10) * 100
    const satisfactionRate =
      stat.totalRatingCount > 0
        ? ((stat.totalScoreSum / stat.totalRatingCount) / 10) * 100
        : 0;

    qualified.push({
      profile: stat.profile,
      satisfactionRate: Math.round(satisfactionRate * 10) / 10, // 1 decimal
      totalPosts: stat.totalPosts,
      recentPosts: stat.recentPosts,
      rank: 0,
    });
  });

  // Sort descending by satisfactionRate; tie-breaker: more recent posts wins
  qualified.sort((a, b) => {
    if (b.satisfactionRate !== a.satisfactionRate) {
      return b.satisfactionRate - a.satisfactionRate;
    }
    return b.recentPosts - a.recentPosts;
  });

  // Assign ranks (1-indexed)
  qualified.forEach((entry, idx) => {
    entry.rank = idx + 1;
  });

  return qualified;
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface LeaderboardViewProps {
  /** Called when the user presses "← Back to Main Menu". */
  onBack: () => void;
}

// ─────────────────────────────────────────────────────────────
// LeaderboardView Component
// ─────────────────────────────────────────────────────────────

const LeaderboardView: React.FC<LeaderboardViewProps> = ({ onBack }) => {
  const { colors, isDark } = useTheme();

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isLive, setIsLive] = useState<boolean>(false);

  // Guard against state updates after unmount
  const mountedRef = useRef<boolean>(true);

  // ─── Leaderboard Refresh ────────────────────────────────
  const refresh = useCallback(async (silent = false) => {
    if (!silent) {
      if (mountedRef.current) setIsLoading(true);
    }
    try {
      // fetchPosts returns DetailedPost[] — already includes author info & ratings
      const posts = await fetchPosts();

      // Map to the lightweight shape computeLiveLeaderboard expects
      const mapped = posts.map((p) => ({
        id: p.id,
        author_id: p.author_id,
        created_at: p.created_at,
        authorUsername: p.author.username,
        authorDisplayName: p.author.display_name,
        ratings: p.ratings.map((r) => ({ score: r.score })),
      }));

      const computed = computeLiveLeaderboard(mapped);

      if (mountedRef.current) {
        setEntries(computed);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.warn('[LeaderboardView] refresh error:', err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  // ─── Initial Load ────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    refresh(false);
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  // ─── Supabase Realtime Subscriptions ────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      // In local/demo mode there are no real-time events;
      // fall back to silent polling every 15 seconds so the UI still feels alive.
      const intervalId = setInterval(() => {
        refresh(true);
      }, 15000);
      return () => clearInterval(intervalId);
    }

    // Subscribe to INSERT & UPDATE on `posts` table
    const postsChannel = supabase
      .channel('leaderboard-posts-watcher')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
        },
        (_payload) => {
          // A new post was created — recompute eligibility
          refresh(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'posts',
        },
        (_payload) => {
          refresh(true);
        }
      )
      .subscribe((status) => {
        if (mountedRef.current) {
          setIsLive(status === 'SUBSCRIBED');
        }
      });

    // Subscribe to INSERT & UPDATE on `post_ratings` table
    const ratingsChannel = supabase
      .channel('leaderboard-ratings-watcher')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_ratings',
        },
        (_payload) => {
          // A new 0–10 rating was submitted — recompute satisfaction rates
          refresh(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'post_ratings',
        },
        (_payload) => {
          refresh(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(ratingsChannel);
    };
  }, [refresh]);

  // ─── Styles ─────────────────────────────────────────────
  const s = createStyles(colors, isDark);

  // ─── Render helpers ──────────────────────────────────────

  const renderHeader = () => (
    <View style={s.headerCard}>
      <View style={s.headerTopRow}>
        <Text style={s.headerTitle}>🏆 Live Leaderboard</Text>
        {isSupabaseConfigured && (
          <View style={[s.liveDot, isLive ? s.liveDotActive : s.liveDotInactive]}>
            <Text style={s.liveDotText}>{isLive ? '● LIVE' : '○ SYNC'}</Text>
          </View>
        )}
      </View>
      <Text style={s.headerRule}>
        Minimum 1 post/week required to stay on the board.
      </Text>
      <Text style={s.headerSubRule}>
        Members with 0 posts in the rolling last 7 days are automatically removed.
        Satisfaction Rate is calculated from all 0–10 ratings received.
      </Text>
      {isLoading ? null : (
        <Text style={s.lastUpdatedText}>
          Last computed: {lastUpdated.toLocaleTimeString()}
        </Text>
      )}
    </View>
  );

  const renderRow = ({ item }: { item: LeaderboardEntry }) => {
    const rank = item.rank;
    const isTop3 = rank <= 3;
    const rankIcon =
      rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
    const rankColor =
      rank === 1
        ? '#00FFCC'
        : rank === 2
        ? '#FF6600'
        : rank === 3
        ? '#FFB800'
        : colors.textSecondary;
    const satPct = Math.min(Math.max(item.satisfactionRate, 0), 100);
    const barWidth = `${satPct}%` as `${number}%`;

    return (
      <View
        style={[
          s.rankRow,
          isTop3 && s.rankRowTop3,
          rank === 1 && s.rankRow1,
          rank === 2 && s.rankRow2,
          rank === 3 && s.rankRow3,
        ]}
      >
        {/* Left: Rank badge */}
        <View style={[s.rankBadgeWrap, { borderColor: rankColor }]}>
          <Text style={[s.rankNumText, { color: rankColor }]}>#{rank}</Text>
          {rankIcon ? <Text style={s.rankIconText}>{rankIcon}</Text> : null}
        </View>

        {/* Middle: User info + bar */}
        <View style={s.memberInfoCol}>
          <Text style={s.memberDisplayName} numberOfLines={1}>
            {item.profile.display_name}
          </Text>
          <Text style={s.memberUsername} numberOfLines={1}>
            @{item.profile.username}
          </Text>

          {/* Satisfaction Progress Bar */}
          <View style={s.satBarTrack}>
            <View style={[s.satBarFill, { width: barWidth, backgroundColor: rankColor }]} />
          </View>

          {/* Weekly post badge */}
          <View style={s.weeklyBadge}>
            <Text style={s.weeklyBadgeText}>
              {item.recentPosts} post{item.recentPosts !== 1 ? 's' : ''} this wk
            </Text>
          </View>
        </View>

        {/* Right: Satisfaction % */}
        <View style={s.satRateCol}>
          <Text style={[s.satRatePct, { color: rankColor }]}>
            {item.satisfactionRate.toFixed(1)}%
          </Text>
          <Text style={s.satRateLabel}>Satisfaction</Text>
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={s.emptyWrap}>
      <Text style={s.emptyEmoji}>🎖️</Text>
      <Text style={s.emptyTitle}>No Members Currently Qualify</Text>
      <Text style={s.emptySubtitle}>
        Publish at least 1 post in the rolling last 7 days to qualify for the
        community leaderboard.
      </Text>
    </View>
  );

  // ─── Main Render ─────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity
          id="btn-leaderboard-back-top"
          style={s.topBackBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to Posts"
        >
          <Text style={s.topBackText}>← Back to Posts</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>Leaderboard</Text>
        <View style={s.topRightPlaceholder} />
      </View>

      {isLoading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.loadingText}>Computing live rankings…</Text>
        </View>
      ) : (
        <FlatList<LeaderboardEntry>
          data={entries}
          keyExtractor={(item) => item.profile.id}
          contentContainerStyle={s.listContent}
          ListHeaderComponent={renderHeader}
          renderItem={renderRow}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Fixed bottom: ← Back to Main Menu */}
      <View style={s.bottomBar}>
        <TouchableOpacity
          id="btn-leaderboard-back-main"
          style={s.backMainBtn}
          onPress={onBack}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Back to Main Menu"
        >
          <Text style={s.backMainText}>← Back to Main Menu</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default LeaderboardView;

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const createStyles = (
  c: ReturnType<typeof useTheme>['colors'],
  isDark: boolean
) =>
  StyleSheet.create({
    // ── Layout ──────────────────────────────────────────────
    container: {
      flex: 1,
      backgroundColor: '#050A0E',
    },

    // ── Top navigation bar ───────────────────────────────────
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: TOP_SAFE_PADDING,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255, 255, 255, 0.07)',
      backgroundColor: isDark ? '#0D161F' : c.surface,
    },
    topBackBtn: {
      paddingVertical: 4,
      paddingHorizontal: 4,
      minWidth: 80,
    },
    topBackText: {
      color: '#00FFCC',
      fontSize: 15,
      fontWeight: '600',
    },
    topTitle: {
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: c.textPrimary,
    },
    topRightPlaceholder: {
      minWidth: 80,
    },

    // ── Header card ──────────────────────────────────────────
    headerCard: {
      backgroundColor: '#0D161F',
      borderColor: 'rgba(255, 255, 255, 0.07)',
      borderWidth: 1,
      borderRadius: 18,
      padding: 18,
      marginBottom: 20,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: c.textPrimary,
    },
    liveDot: {
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    liveDotActive: {
      backgroundColor: 'rgba(0, 255, 204, 0.1)',
      borderColor: 'rgba(0, 255, 204, 0.3)',
      borderWidth: 1,
    },
    liveDotInactive: {
      backgroundColor: isDark ? '#0A1017' : '#E8EFF5',
      borderColor: 'rgba(255, 255, 255, 0.07)',
      borderWidth: 1,
    },
    liveDotText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#00FFCC',
    },
    headerRule: {
      fontSize: 14,
      fontWeight: '700',
      color: '#00FFCC',
      marginBottom: 6,
    },
    headerSubRule: {
      fontSize: 12,
      color: '#7E8E9C',
      lineHeight: 18,
    },
    lastUpdatedText: {
      fontSize: 12,
      color: '#7E8E9C',
      marginTop: 8,
      fontStyle: 'italic',
    },

    // ── List ────────────────────────────────────────────────
    listContent: {
      padding: 16,
      paddingBottom: 100,
    },

    // ── Rank Row ────────────────────────────────────────────
    rankRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#0D161F',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.07)',
      padding: 16,
      marginBottom: 12,
    },
    rankRowTop3: {
      borderWidth: 1,
    },
    rankRow1: {
      borderColor: 'rgba(0, 255, 204, 0.3)',
      backgroundColor: isDark ? 'rgba(0, 255, 204, 0.04)' : '#EAFFF9',
    },
    rankRow2: {
      borderColor: 'rgba(255, 102, 0, 0.3)',
      backgroundColor: isDark ? 'rgba(255, 102, 0, 0.04)' : '#FFF5EE',
    },
    rankRow3: {
      borderColor: 'rgba(255, 184, 0, 0.3)',
      backgroundColor: isDark ? 'rgba(255, 184, 0, 0.04)' : '#FFFAEE',
    },

    // ── Rank Badge ───────────────────────────────────────────
    rankBadgeWrap: {
      width: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 8,
      marginRight: 14,
      backgroundColor: isDark ? '#0A1017' : '#F4F7F9',
    },
    rankNumText: {
      fontSize: 16,
      fontWeight: '700',
    },
    rankIconText: {
      fontSize: 18,
      marginTop: 2,
    },

    // ── Member info column ───────────────────────────────────
    memberInfoCol: {
      flex: 1,
      marginRight: 12,
    },
    memberDisplayName: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 2,
    },
    memberUsername: {
      fontSize: 12,
      color: c.textSecondary,
      marginBottom: 8,
    },

    // ── Satisfaction bar ─────────────────────────────────────
    satBarTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? '#16222E' : '#DCE4EC',
      overflow: 'hidden',
      marginBottom: 8,
    },
    satBarFill: {
      height: 6,
      borderRadius: 3,
    },

    // ── Weekly badge ─────────────────────────────────────────
    weeklyBadge: {
      alignSelf: 'flex-start',
      backgroundColor: isDark ? '#1A2C38' : '#E8EFF5',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    weeklyBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textPrimary,
    },

    // ── Satisfaction rate column (right) ─────────────────────
    satRateCol: {
      alignItems: 'center',
      minWidth: 64,
    },
    satRatePct: {
      fontSize: 20,
      fontWeight: '700',
    },
    satRateLabel: {
      fontSize: 10,
      color: c.textSecondary,
      fontWeight: '600',
    },

    // ── Empty state ──────────────────────────────────────────
    emptyWrap: {
      alignItems: 'center',
      paddingVertical: 60,
      paddingHorizontal: 32,
    },
    emptyEmoji: {
      fontSize: 48,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textPrimary,
      textAlign: 'center',
      marginBottom: 10,
    },
    emptySubtitle: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },

    // ── Loading ──────────────────────────────────────────────
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      color: c.textSecondary,
      fontSize: 14,
      marginTop: 12,
    },

    // ── Fixed bottom bar ─────────────────────────────────────
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 28 : 14,
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    backMainBtn: {
      backgroundColor: isDark ? '#0D161F' : '#F0F4F8',
      borderColor: isDark ? 'rgba(0, 255, 204, 0.5)' : c.primary,
      borderWidth: 1,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backMainText: {
      color: c.primary,
      fontSize: 16,
      fontWeight: '700',
    },
  });
