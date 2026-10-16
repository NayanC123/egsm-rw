// src/screens/PostsScreen.tsx
// Phase 3 — Complete Posts Interface: Feed, Create, Detail (0–10 Rating), & Leaderboard.
// STRICT ANTI-CRASH: ONLY built-in react-native components, pure state router, no delete actions anywhere.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  RefreshControl,
  Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  fetchPosts,
  createPost,
  ratePost,
  toggleAnnouncement,
  DetailedPost,
  RatingWithRater,
} from '../services/postsService';
import type { DocumentAttachment } from '../types/database';
import LeaderboardView from '../components/Posts/LeaderboardView';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

type PostsPageState = 'feed' | 'detail' | 'create' | 'leaderboard';

// ─────────────────────────────────────────────────────────────
// Sample Presets for Quick Image & Document Attachments
// ─────────────────────────────────────────────────────────────

interface ImagePreset {
  label: string;
  url: string;
}

const SAMPLE_IMAGE_PRESETS: ImagePreset[] = [
  {
    label: 'Cloud Infrastructure Diagram',
    url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&auto=format&fit=crop&q=80',
  },
  {
    label: 'Security & Encryption Node',
    url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80',
  },
  {
    label: 'Realtime Performance Analytics',
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80',
  },
  {
    label: 'Global Network Mesh Topology',
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
  },
];

const SAMPLE_DOCUMENT_PRESETS: DocumentAttachment[] = [
  {
    name: 'Decentralized_Protocol_Whitepaper_v2.pdf',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    mimeType: 'application/pdf',
    size: 1845120, // 1.8 MB
  },
  {
    name: 'Executive_Voice_Briefing.m4a',
    url: 'https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg',
    mimeType: 'audio/m4a',
    size: 3410500, // 3.4 MB
  },
  {
    name: 'Security_Audit_Report_2026.docx',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 924500, // 924 KB
  },
];

// Helper to format file sizes
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper to format timestamps
function formatTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return isoString;
  }
}

// ─────────────────────────────────────────────────────────────
// Main Posts Screen Component
// ─────────────────────────────────────────────────────────────

const PostsScreen: React.FC = () => {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();

  // Internal page navigation state: 'feed' | 'detail' | 'create' | 'leaderboard'
  const [pageState, setPageState] = useState<PostsPageState>('feed');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // Feed state
  const [posts, setPosts] = useState<DetailedPost[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);


  // Create Post form state
  const [newSubject, setNewSubject] = useState<string>('');
  const [newContent, setNewContent] = useState<string>('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [attachedDocs, setAttachedDocs] = useState<DocumentAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Attachment Picker Modals
  const [imageModalVisible, setImageModalVisible] = useState<boolean>(false);
  const [customImageUrl, setCustomImageUrl] = useState<string>('');
  const [docModalVisible, setDocModalVisible] = useState<boolean>(false);
  const [customDocName, setCustomDocName] = useState<string>('');
  const [customDocUrl, setCustomDocUrl] = useState<string>('');

  // Fullscreen Image Viewer Modal
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

  // Admin announcement toggling state
  const [isTogglingAnnouncement, setIsTogglingAnnouncement] = useState<boolean>(false);

  // Load posts
  const loadPosts = useCallback(async () => {
    try {
      const data = await fetchPosts(user?.id);
      setPosts(data);
    } catch (err) {
      console.warn('loadPosts error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Handle pull-to-refresh
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadPosts();
  }, [loadPosts]);

  const openLeaderboard = useCallback(() => {
    setPageState('leaderboard');
  }, []);

  // Selected post object
  const currentPost = useMemo(() => {
    if (!selectedPostId) return null;
    return posts.find((p) => p.id === selectedPostId) || null;
  }, [posts, selectedPostId]);

  // ─────────────────────────────────────────────────────────────
  // Action Handlers
  // ─────────────────────────────────────────────────────────────

  const handleOpenDetail = (postId: string) => {
    setSelectedPostId(postId);
    setPageState('detail');
  };

  const handleOpenCreate = () => {
    setNewSubject('');
    setNewContent('');
    setAttachedImages([]);
    setAttachedDocs([]);
    setPageState('create');
  };

  const handlePublishPost = async () => {
    if (!user) {
      Alert.alert('Authentication Required', 'Please log in to publish a post.');
      return;
    }
    const cleanSubject = newSubject.trim();
    const cleanContent = newContent.trim();

    if (!cleanSubject) {
      Alert.alert('Missing Subject', 'Please enter a subject for your post.');
      return;
    }
    if (!cleanContent) {
      Alert.alert('Missing Content', 'Please enter content for your post.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createPost({
        author_id: user.id,
        subject: cleanSubject,
        content: cleanContent,
        image_urls: attachedImages,
        document_urls: attachedDocs,
        is_announcement: false,
      });

      if (!res.success) {
        Alert.alert('Error', res.error || 'Failed to create post.');
        return;
      }

      await loadPosts();
      setPageState('feed');
      Alert.alert('Post Published', 'Your permanent post is now active and available for community rating.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Unexpected failure while publishing.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRate = async (score: number) => {
    if (!user || !currentPost) return;

    try {
      await ratePost({
        post_id: currentPost.id,
        rater: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
        },
        score,
      });
      // Refresh local posts to update ratings and satisfaction rate
      await loadPosts();
    } catch (err) {
      console.warn('handleRate error:', err);
    }
  };

  const handleToggleAnnouncement = async () => {
    if (!currentPost || user?.role !== 'admin') return;

    setIsTogglingAnnouncement(true);
    try {
      const newStatus = !currentPost.is_announcement;
      const res = await toggleAnnouncement(currentPost.id, newStatus);
      if (res.success) {
        await loadPosts();
      } else {
        Alert.alert('Error', res.error || 'Failed to update announcement status.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update announcement.');
    } finally {
      setIsTogglingAnnouncement(false);
    }
  };

  const handleOpenDocUrl = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot Open', 'No application found to handle this document link.');
      }
    } catch (err) {
      Alert.alert('Error', 'Unable to open attachment URL.');
    }
  };

  // Add sample or custom image
  const addImageAttachment = (url: string) => {
    if (!url.trim()) return;
    if (!attachedImages.includes(url.trim())) {
      setAttachedImages((prev) => [...prev, url.trim()]);
    }
    setCustomImageUrl('');
    setImageModalVisible(false);
  };

  // Remove attached image
  const removeImageAttachment = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Add document attachment
  const addDocumentAttachment = (doc: DocumentAttachment) => {
    setAttachedDocs((prev) => [...prev, doc]);
    setCustomDocName('');
    setCustomDocUrl('');
    setDocModalVisible(false);
  };

  // Remove attached document
  const removeDocumentAttachment = (index: number) => {
    setAttachedDocs((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Native Device Picker Handlers (Wrapped in try/catch) ──
  const handleNativePickImageFromLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Media library access is required to select photos from your device.'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        addImageAttachment(result.assets[0].uri);
      }
    } catch (err: any) {
      console.warn('[PostsScreen ImagePicker Error]:', err);
      Alert.alert('Picker Error', err?.message || 'Could not pick image from device.');
    }
  };

  const handleNativeTakePhotoWithCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera Permission Required',
          'Camera access is required to take photos.'
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        addImageAttachment(result.assets[0].uri);
      }
    } catch (err: any) {
      console.warn('[PostsScreen Camera Error]:', err);
      Alert.alert('Camera Error', err?.message || 'Could not capture photo.');
    }
  };

  const handleNativePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        addDocumentAttachment({
          name: asset.name || 'document.bin',
          url: asset.uri,
          mimeType: asset.mimeType || 'application/octet-stream',
          size: asset.size || 0,
        });
      }
    } catch (err: any) {
      console.warn('[PostsScreen DocumentPicker Error]:', err);
      Alert.alert('Document Picker Error', err?.message || 'Could not pick document from device.');
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Styles Factory
  // ─────────────────────────────────────────────────────────────
  const s = createStyles(colors, isDark);

  // ─────────────────────────────────────────────────────────────
  // VIEW 1: Posts List Menu ('feed')
  // ─────────────────────────────────────────────────────────────

  const renderFeed = () => {
    // Separate pinned announcements from regular posts
    const announcements = posts.filter((p) => p.is_announcement);
    const regularPosts = posts.filter((p) => !p.is_announcement);

    return (
      <View style={s.container}>
        {/* Top Header Bar */}
        <View style={s.topHeader}>
          <View style={s.titleContainer}>
            <Text style={s.headerTitle}>egsm. posts</Text>
            <View style={s.permanentBadge}>
              <Text style={s.permanentBadgeText}>IMMUTABLE</Text>
            </View>
          </View>
          <TouchableOpacity
            id="btn-leaderboard"
            style={s.leaderboardButton}
            onPress={openLeaderboard}
            accessibilityRole="button"
            accessibilityLabel="Open Leaderboard"
          >
            <Text style={s.leaderboardButtonText}>🏆 Leaderboard</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={s.centeredContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loadingText}>Loading community posts...</Text>
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            contentContainerStyle={s.listContent}
            ListHeaderComponent={
              announcements.length > 0 ? (
                <View style={s.announcementsHeaderBox}>
                  <Text style={s.announcementsSectionLabel}>📢 PINNED ANNOUNCEMENTS</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const isAnnouncement = item.is_announcement;
              const satRate = item.satisfactionRate;
              const hasRatings = satRate !== null;

              return (
                <TouchableOpacity
                  id={`post-card-${item.id}`}
                  style={[
                    s.postCard,
                    isAnnouncement ? s.announcementCard : s.regularCard,
                  ]}
                  onPress={() => handleOpenDetail(item.id)}
                  activeOpacity={0.8}
                >
                  {/* Announcement Banner */}
                  {isAnnouncement && (
                    <View style={s.announcementBadgeRow}>
                      <Text style={s.announcementBadgeText}>📢 ANNOUNCEMENT — PINNED</Text>
                    </View>
                  )}

                  {/* Author & Timestamp */}
                  <View style={s.postMetaRow}>
                    <View style={s.authorInfo}>
                      <Text style={s.authorDisplayName} numberOfLines={1}>
                        {item.author.display_name}
                      </Text>
                      <Text style={s.authorUsername} numberOfLines={1}>
                        @{item.author.username}
                      </Text>
                    </View>
                    <Text style={s.timestampText}>{formatTime(item.created_at)}</Text>
                  </View>

                  {/* Subject */}
                  <Text style={s.postSubject} numberOfLines={2}>
                    {item.subject}
                  </Text>

                  {/* Content Preview */}
                  <Text style={s.postPreviewText} numberOfLines={2}>
                    {item.content}
                  </Text>

                  {/* Footer Row: Attachments & Satisfaction Rate */}
                  <View style={s.postFooterRow}>
                    {/* Attachment Indicators */}
                    <View style={s.attachmentPillsRow}>
                      {item.image_urls.length > 0 && (
                        <View style={s.attachmentIndicator}>
                          <Text style={s.attachmentIndicatorText}>
                            📷 {item.image_urls.length}
                          </Text>
                        </View>
                      )}
                      {item.document_urls.length > 0 && (
                        <View style={s.attachmentIndicator}>
                          <Text style={s.attachmentIndicatorText}>
                            📎 {item.document_urls.length}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Live Satisfaction Rate Badge */}
                    <View
                      style={[
                        s.satisfactionBadge,
                        hasRatings ? s.satisfactionBadgeActive : s.satisfactionBadgeEmpty,
                      ]}
                    >
                      <Text
                        style={[
                          s.satisfactionBadgeText,
                          hasRatings ? s.satisfactionTextActive : s.satisfactionTextEmpty,
                        ]}
                      >
                        {hasRatings
                          ? `★ ${satRate.toFixed(1)}% Satisfaction`
                          : 'No ratings yet (0.0%)'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Text style={s.emptyEmoji}>📋</Text>
                <Text style={s.emptyTitle}>No Posts Yet</Text>
                <Text style={s.emptySubtitle}>
                  Be the first member to publish a permanent discussion post.
                </Text>
              </View>
            }
          />
        )}

        {/* Fixed Bottom Action Bar: (+ New) Button */}
        <View style={s.bottomActionBar}>
          <TouchableOpacity
            id="btn-new-post"
            style={s.newPostButton}
            onPress={handleOpenCreate}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Create New Post"
          >
            <Text style={s.newPostButtonText}>+ New Post</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─────────────────────────────────────────────────────────────
  // VIEW 2: Create Post Page ('create')
  // ─────────────────────────────────────────────────────────────

  const renderCreate = () => {
    return (
      <View style={s.container}>
        {/* Top bar with (<- Cancel) and title */}
        <View style={s.topHeader}>
          <TouchableOpacity
            id="btn-cancel-create"
            style={s.headerBackButton}
            onPress={() => setPageState('feed')}
            accessibilityRole="button"
            accessibilityLabel="Cancel Post Creation"
          >
            <Text style={s.headerBackText}>← Cancel</Text>
          </TouchableOpacity>
          <Text style={s.headerTitleCenter}>Create Permanent Post</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          style={s.createScrollView}
          contentContainerStyle={s.createScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Permanence Notice Banner (#FF6600) */}
          <View style={s.permanenceBanner}>
            <Text style={s.permanenceBannerText}>
              ⚠️ Posts once made cannot be deleted. They will be suggested to members and rated 0–10.
            </Text>
          </View>

          {/* Post Subject Input */}
          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>
              Post Subject <Text style={s.requiredStar}>*</Text>
            </Text>
            <TextInput
              id="input-post-subject"
              style={s.subjectInput}
              placeholder="e.g. Protocol Upgrade Proposal 2026..."
              placeholderTextColor="#4B5A68"
              value={newSubject}
              onChangeText={setNewSubject}
              maxLength={120}
            />
          </View>

          {/* Post Content Input */}
          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>
              Post Content <Text style={s.requiredStar}>*</Text>
            </Text>
            <TextInput
              id="input-post-content"
              style={s.contentInput}
              placeholder="Write the full body of your discussion or technical analysis here..."
              placeholderTextColor="#4B5A68"
              value={newContent}
              onChangeText={setNewContent}
              multiline
              textAlignVertical="top"
              numberOfLines={8}
            />
          </View>

          {/* Attachment Toolbar */}
          <View style={s.attachmentToolbar}>
            <Text style={s.toolbarTitle}>Attachments & Media</Text>
            <View style={s.toolbarButtonsRow}>
              {/* 📷 Camera Button */}
              <TouchableOpacity
                id="btn-attach-image"
                style={s.toolButton}
                onPress={() => setImageModalVisible(true)}
              >
                <Text style={s.toolButtonText}>📷 Attach Image</Text>
              </TouchableOpacity>

              {/* 📎 Paperclip Button */}
              <TouchableOpacity
                id="btn-attach-doc"
                style={s.toolButton}
                onPress={() => setDocModalVisible(true)}
              >
                <Text style={s.toolButtonText}>📎 Attach Document</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Attached Images Preview (Removable Thumbnails) */}
          {attachedImages.length > 0 && (
            <View style={s.attachedSection}>
              <Text style={s.attachedSectionTitle}>
                Attached Images ({attachedImages.length})
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.thumbnailRow}>
                {attachedImages.map((imgUrl, index) => (
                  <View key={`img-${index}`} style={s.thumbnailContainer}>
                    <Image source={{ uri: imgUrl }} style={s.thumbnailImage} resizeMode="cover" />
                    <TouchableOpacity
                      id={`btn-remove-img-${index}`}
                      style={s.removeThumbnailButton}
                      onPress={() => removeImageAttachment(index)}
                      accessibilityLabel="Remove image attachment"
                    >
                      <Text style={s.removeThumbnailText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Attached Documents List (Removable Badges) */}
          {attachedDocs.length > 0 && (
            <View style={s.attachedSection}>
              <Text style={s.attachedSectionTitle}>
                Attached Documents ({attachedDocs.length})
              </Text>
              {attachedDocs.map((doc, index) => (
                <View key={`doc-${index}`} style={s.docItemCard}>
                  <View style={s.docItemInfo}>
                    <Text style={s.docItemName} numberOfLines={1}>
                      📄 {doc.name}
                    </Text>
                    <Text style={s.docItemSize}>{formatFileSize(doc.size)}</Text>
                  </View>
                  <TouchableOpacity
                    id={`btn-remove-doc-${index}`}
                    style={s.removeDocButton}
                    onPress={() => removeDocumentAttachment(index)}
                    accessibilityLabel="Remove document attachment"
                  >
                    <Text style={s.removeDocText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom (Post) Button */}
        <View style={s.bottomActionBar}>
          <TouchableOpacity
            id="btn-submit-post"
            style={[s.newPostButton, isSubmitting && s.buttonDisabled]}
            onPress={handlePublishPost}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#050A0E" />
            ) : (
              <Text style={s.newPostButtonText}>Publish Permanent Post</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Image Attachment Picker Modal ── */}
        <Modal
          visible={imageModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setImageModalVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={s.pickerModalBox}>
              <Text style={s.pickerModalTitle}>📷 Attach Image</Text>
              <Text style={s.pickerModalSubtitle}>
                Select an image from your device, enter a direct URL, or pick a preset:
              </Text>

              {/* Native Device Pickers */}
              <TouchableOpacity
                id="btn-native-camera"
                style={s.nativePickerButton}
                onPress={handleNativeTakePhotoWithCamera}
              >
                <Text style={s.nativePickerText}>📸 Capture Photo with Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                id="btn-native-gallery"
                style={s.nativePickerButton}
                onPress={handleNativePickImageFromLibrary}
              >
                <Text style={s.nativePickerText}>🖼️ Choose Photo from Device Library</Text>
              </TouchableOpacity>

              <Text style={s.orDividerText}>── OR INSERT IMAGE URL ──</Text>

              {/* Custom URL Input */}
              <TextInput
                id="input-custom-image-url"
                style={s.pickerInput}
                placeholder="https://example.com/image.jpg"
                placeholderTextColor="#4B5A68"
                value={customImageUrl}
                onChangeText={setCustomImageUrl}
                autoCapitalize="none"
              />
              <TouchableOpacity
                id="btn-confirm-custom-image"
                style={[s.modalActionButton, !customImageUrl.trim() && s.buttonDisabled]}
                disabled={!customImageUrl.trim()}
                onPress={() => addImageAttachment(customImageUrl)}
              >
                <Text style={s.modalActionText}>Add Image URL</Text>
              </TouchableOpacity>

              <Text style={s.presetSectionLabel}>Or choose from presets:</Text>
              <ScrollView style={{ maxHeight: 180 }}>
                {SAMPLE_IMAGE_PRESETS.map((preset, idx) => (
                  <TouchableOpacity
                    key={`preset-${idx}`}
                    style={s.presetRow}
                    onPress={() => addImageAttachment(preset.url)}
                  >
                    <Image source={{ uri: preset.url }} style={s.presetThumb} />
                    <Text style={s.presetLabel} numberOfLines={1}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={s.modalCloseButton}
                onPress={() => setImageModalVisible(false)}
              >
                <Text style={s.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ── Document Attachment Picker Modal ── */}
        <Modal
          visible={docModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDocModalVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={s.pickerModalBox}>
              <Text style={s.pickerModalTitle}>📎 Attach Document</Text>
              <Text style={s.pickerModalSubtitle}>
                Select a document from device storage, insert a link, or pick a standard preset:
              </Text>

              {/* Native Document Picker */}
              <TouchableOpacity
                id="btn-native-document-picker"
                style={s.nativePickerButton}
                onPress={handleNativePickDocument}
              >
                <Text style={s.nativePickerText}>📂 Pick File from Device Storage</Text>
              </TouchableOpacity>

              <Text style={s.orDividerText}>── OR ATTACH CUSTOM URL ──</Text>

              {/* Custom Document Entry */}
              <TextInput
                id="input-custom-doc-name"
                style={s.pickerInput}
                placeholder="Document filename (e.g. Audit_Report.pdf)"
                placeholderTextColor="#4B5A68"
                value={customDocName}
                onChangeText={setCustomDocName}
              />
              <TextInput
                id="input-custom-doc-url"
                style={s.pickerInput}
                placeholder="Document download URL (https://...)"
                placeholderTextColor="#4B5A68"
                value={customDocUrl}
                onChangeText={setCustomDocUrl}
                autoCapitalize="none"
              />
              <TouchableOpacity
                id="btn-confirm-custom-doc"
                style={[
                  s.modalActionButton,
                  (!customDocName.trim() || !customDocUrl.trim()) && s.buttonDisabled,
                ]}
                disabled={!customDocName.trim() || !customDocUrl.trim()}
                onPress={() =>
                  addDocumentAttachment({
                    name: customDocName.trim(),
                    url: customDocUrl.trim(),
                    mimeType: 'application/pdf',
                    size: 1024 * 500, // 500 KB default
                  })
                }
              >
                <Text style={s.modalActionText}>Add Document</Text>
              </TouchableOpacity>

              <Text style={s.presetSectionLabel}>Or choose from verified presets:</Text>
              <ScrollView style={{ maxHeight: 180 }}>
                {SAMPLE_DOCUMENT_PRESETS.map((docPreset, idx) => (
                  <TouchableOpacity
                    key={`doc-preset-${idx}`}
                    style={s.presetRow}
                    onPress={() => addDocumentAttachment(docPreset)}
                  >
                    <Text style={s.presetDocEmoji}>📄</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.presetLabel} numberOfLines={1}>
                        {docPreset.name}
                      </Text>
                      <Text style={s.presetDocMeta}>{formatFileSize(docPreset.size)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={s.modalCloseButton}
                onPress={() => setDocModalVisible(false)}
              >
                <Text style={s.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  // ─────────────────────────────────────────────────────────────
  // VIEW 3: Post Detail & 0–10 Ratings Page ('detail')
  // ─────────────────────────────────────────────────────────────

  const renderDetail = () => {
    if (!currentPost) {
      return (
        <View style={s.centeredContent}>
          <Text style={s.loadingText}>Post not found.</Text>
          <TouchableOpacity style={s.backButton} onPress={() => setPageState('feed')}>
            <Text style={s.backButtonText}>← Back to Posts</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const satRate = currentPost.satisfactionRate;
    const avgScore = currentPost.averageRating;
    const totalVotes = currentPost.ratings.length;
    const myScore = currentPost.myRating?.score;
    const isAdmin = user?.role === 'admin';

    // Ratings given by others
    const otherRatings = currentPost.ratings.filter(
      (r) => !user || r.rater_id !== user.id
    );

    // Clickable 0 to 10 numbers
    const scoreButtons = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    return (
      <View style={s.container}>
        {/* Top bar with (<- Back to Posts) & Admin announcement toggle */}
        <View style={s.topHeader}>
          <TouchableOpacity
            id="btn-back-to-feed"
            style={s.headerBackButton}
            onPress={() => setPageState('feed')}
            accessibilityRole="button"
            accessibilityLabel="Back to Posts"
          >
            <Text style={s.headerBackText}>← Back to Posts</Text>
          </TouchableOpacity>

          {/* Admin Announcement Quick Toggle */}
          {isAdmin && (
            <TouchableOpacity
              id="btn-admin-toggle-announcement"
              style={[
                s.adminToggleButton,
                currentPost.is_announcement ? s.adminToggleActive : s.adminToggleInactive,
              ]}
              onPress={handleToggleAnnouncement}
              disabled={isTogglingAnnouncement}
            >
              {isTogglingAnnouncement ? (
                <ActivityIndicator size="small" color="#FF6600" />
              ) : (
                <Text
                  style={[
                    s.adminToggleText,
                    currentPost.is_announcement
                      ? s.adminToggleTextActive
                      : s.adminToggleTextInactive,
                  ]}
                >
                  {currentPost.is_announcement ? '📢 Pinned' : '📢 Pin as Announcement'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={s.detailScrollView}
          contentContainerStyle={s.detailScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Announcement Header Badge */}
          {currentPost.is_announcement && (
            <View style={s.detailAnnouncementBadge}>
              <Text style={s.detailAnnouncementText}>📢 ANNOUNCEMENT — PINNED BY ADMIN</Text>
            </View>
          )}

          {/* Post Subject (Large bold title) */}
          <Text style={s.detailSubject} selectable>
            {currentPost.subject}
          </Text>

          {/* Poster info (Display Name @username + timestamp) */}
          <View style={s.detailAuthorRow}>
            <View style={s.authorAvatarBox}>
              <Text style={s.authorAvatarText}>
                {currentPost.author.display_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={s.authorMetaBox}>
              <Text style={s.detailDisplayName}>{currentPost.author.display_name}</Text>
              <Text style={s.detailUsername}>
                @{currentPost.author.username} • {formatTime(currentPost.created_at)}
              </Text>
            </View>
          </View>

          {/* Post Content (full body text with selectable / link support) */}
          <View style={s.detailContentCard}>
            <Text style={s.detailContentText} selectable>
              {currentPost.content}
            </Text>
          </View>

          {/* Attached Images Gallery */}
          {currentPost.image_urls.length > 0 && (
            <View style={s.gallerySection}>
              <Text style={s.sectionHeader}>Attached Images ({currentPost.image_urls.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.galleryScroll}>
                {currentPost.image_urls.map((imgUrl, idx) => (
                  <TouchableOpacity
                    key={`detail-img-${idx}`}
                    style={s.galleryImageWrapper}
                    onPress={() => setFullScreenImage(imgUrl)}
                    activeOpacity={0.9}
                  >
                    <Image source={{ uri: imgUrl }} style={s.galleryImage} resizeMode="cover" />
                    <View style={s.zoomHintBadge}>
                      <Text style={s.zoomHintText}>🔍 Tap to Expand</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Attached Documents Section */}
          {currentPost.document_urls.length > 0 && (
            <View style={s.documentsSection}>
              <Text style={s.sectionHeader}>
                Attached Documents ({currentPost.document_urls.length})
              </Text>
              {currentPost.document_urls.map((doc, idx) => (
                <View key={`detail-doc-${idx}`} style={s.detailDocCard}>
                  <View style={s.detailDocInfo}>
                    <Text style={s.detailDocName} numberOfLines={1}>
                      📄 {doc.name}
                    </Text>
                    <View style={s.detailDocMetaRow}>
                      <View style={s.docTypeBadge}>
                        <Text style={s.docTypeBadgeText}>
                          {doc.mimeType.includes('pdf')
                            ? 'PDF'
                            : doc.mimeType.includes('audio')
                              ? 'AUDIO'
                              : 'DOCUMENT'}
                        </Text>
                      </View>
                      <Text style={s.detailDocSize}>{formatFileSize(doc.size)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    id={`btn-open-doc-${idx}`}
                    style={s.openDocButton}
                    onPress={() => handleOpenDocUrl(doc.url)}
                  >
                    <Text style={s.openDocButtonText}>Open / Download</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* ─────────────────────────────────────────────────────────────
              Interactive 0–10 Rating Section
          ───────────────────────────────────────────────────────────── */}
          <View style={s.ratingSectionCard}>
            <Text style={s.ratingSectionTitle}>Satisfaction Rating (0–10)</Text>

            {/* Satisfaction Rate % + Visual #00FFCC Progress Bar */}
            <View style={s.satisfactionDisplayBox}>
              <View style={s.satisfactionTextRow}>
                <Text style={s.satisfactionPercentText}>
                  {satRate !== null ? `${satRate.toFixed(1)}%` : '0.0%'}
                </Text>
                <Text style={s.satisfactionSubtitle}>
                  {avgScore !== null
                    ? `Average: ${avgScore.toFixed(1)} / 10 (${totalVotes} ${totalVotes === 1 ? 'rating' : 'ratings'
                    })`
                    : 'No ratings submitted yet'}
                </Text>
              </View>

              {/* Visual Progress Bar */}
              <View style={s.progressBarTrack}>
                <View
                  style={[
                    s.progressBarFill,
                    {
                      width: `${satRate !== null ? Math.min(Math.max(satRate, 2), 100) : 0}%`,
                    },
                  ]}
                />
              </View>
            </View>

            {/* 11 Clickable Number Buttons (0 to 10) */}
            <Text style={s.rateInstructions}>Tap a number from 0 to 10 to submit your rating:</Text>
            <View style={s.numberButtonsRow}>
              {scoreButtons.map((scoreVal) => {
                const isSelected = myScore === scoreVal;
                return (
                  <TouchableOpacity
                    key={`score-btn-${scoreVal}`}
                    id={`btn-rate-${scoreVal}`}
                    style={[s.numberButton, isSelected && s.numberButtonSelected]}
                    onPress={() => handleRate(scoreVal)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Rate ${scoreVal} out of 10`}
                  >
                    <Text
                      style={[
                        s.numberButtonText,
                        isSelected && s.numberButtonTextSelected,
                      ]}
                    >
                      {scoreVal}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {myScore !== undefined && (
              <View style={s.yourScoreNotice}>
                <Text style={s.yourScoreText}>
                  Your current rating: <Text style={s.yourScoreHighlight}>{myScore} / 10</Text>{' '}
                  (Tap any other number to update)
                </Text>
              </View>
            )}

            {/* Ratings Given by Others List */}
            <View style={s.othersRatingsSection}>
              <Text style={s.othersRatingsTitle}>
                Ratings Given by Others ({otherRatings.length})
              </Text>

              {otherRatings.length === 0 ? (
                <Text style={s.noOthersText}>
                  No other members have rated this post yet.
                </Text>
              ) : (
                otherRatings.map((rating) => (
                  <View key={`other-rating-${rating.id}`} style={s.ratingRowCard}>
                    <View style={s.raterInfo}>
                      <Text style={s.raterDisplayName}>
                        {rating.rater?.display_name || 'Member'}
                      </Text>
                      <Text style={s.raterUsername}>
                        @{rating.rater?.username || 'user'} • {formatTime(rating.created_at)}
                      </Text>
                    </View>
                    <View style={s.raterScoreBadge}>
                      <Text style={s.raterScoreText}>Scored {rating.score} / 10</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Fullscreen Image Viewer Modal */}
        <Modal
          visible={fullScreenImage !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setFullScreenImage(null)}
        >
          <View style={s.fullscreenOverlay}>
            <TouchableOpacity
              style={s.fullscreenCloseButton}
              onPress={() => setFullScreenImage(null)}
              accessibilityLabel="Close full screen image"
            >
              <Text style={s.fullscreenCloseText}>✕ Close</Text>
            </TouchableOpacity>
            {fullScreenImage && (
              <Image
                source={{ uri: fullScreenImage }}
                style={s.fullscreenImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Modal>
      </View>
    );
  };

  // ─────────────────────────────────────────────────────────────
  // VIEW 4: Live Leaderboard — delegated to LeaderboardView component
  // (owns Supabase Realtime subscriptions internally)
  // ─────────────────────────────────────────────────────────────

  const renderLeaderboard = () => (
    <LeaderboardView onBack={() => setPageState('feed')} />
  );

  // ─────────────────────────────────────────────────────────────
  // Root Page State Switcher
  // ─────────────────────────────────────────────────────────────

  switch (pageState) {
    case 'create':
      return renderCreate();
    case 'detail':
      return renderDetail();
    case 'leaderboard':
      return renderLeaderboard();
    case 'feed':
    default:
      return renderFeed();
  }
};

// ─────────────────────────────────────────────────────────────
// Dynamic StyleSheet Generator (Android Safe FontWeights)
// ─────────────────────────────────────────────────────────────

const createStyles = (c: ReturnType<typeof useTheme>['colors'], isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#050A0E',
    },
    centeredContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    loadingText: {
      color: '#7E8E9C',
      fontSize: 14,
      marginTop: 12,
    },

    // ── Top Header ──────────────────────────────────────────
    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255, 255, 255, 0.07)',
      backgroundColor: isDark ? '#0D161F' : c.surface,
    },
    titleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: c.textPrimary,
      marginRight: 8,
    },
    headerTitleCenter: {
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: c.textPrimary,
    },
    permanentBadge: {
      backgroundColor: 'rgba(0, 255, 204, 0.08)',
      borderColor: 'rgba(0, 255, 204, 0.25)',
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    permanentBadgeText: {
      color: '#00FFCC',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    leaderboardButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 255, 204, 0.08)',
      borderColor: 'rgba(0, 255, 204, 0.3)',
      borderWidth: 1,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 20,
    },
    leaderboardButtonText: {
      color: '#00FFCC',
      fontSize: 13,
      fontWeight: '700',
    },
    headerBackButton: {
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    headerBackText: {
      color: '#00FFCC',
      fontSize: 15,
      fontWeight: '600',
    },

    // ── Feed View ───────────────────────────────────────────
    listContent: {
      padding: 16,
      paddingBottom: 90, // Leave room for fixed bottom action bar
    },
    announcementsHeaderBox: {
      marginBottom: 12,
    },
    announcementsSectionLabel: {
      color: '#FF6600',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    postCard: {
      backgroundColor: '#0D161F',
      borderRadius: 18,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
    },
    regularCard: {
      borderColor: 'rgba(255, 255, 255, 0.07)',
    },
    announcementCard: {
      borderColor: 'rgba(255, 102, 0, 0.25)',
      backgroundColor: isDark ? 'rgba(255, 102, 0, 0.06)' : '#FFF9F5',
      borderWidth: 1,
      shadowColor: '#FF6600',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 3,
    },
    announcementBadgeRow: {
      backgroundColor: 'rgba(255, 102, 0, 0.12)',
      borderColor: '#FF6600',
      borderWidth: 1,
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      marginBottom: 10,
    },
    announcementBadgeText: {
      color: '#FF6600',
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    postMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    authorInfo: {
      flex: 1,
      marginRight: 8,
    },
    authorDisplayName: {
      fontSize: 14,
      fontWeight: '700',
      color: c.textPrimary,
    },
    authorUsername: {
      fontSize: 12,
      color: '#7E8E9C',
    },
    timestampText: {
      fontSize: 12,
      color: '#7E8E9C',
    },
    postSubject: {
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: c.textPrimary,
      marginBottom: 6,
    },
    postPreviewText: {
      fontSize: 15,
      lineHeight: 22,
      color: '#A1B1C0',
      marginBottom: 12,
    },
    postFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255, 255, 255, 0.07)',
    },
    attachmentPillsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    attachmentIndicator: {
      backgroundColor: isDark ? '#16222E' : '#E8EFF5',
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginRight: 6,
    },
    attachmentIndicatorText: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textPrimary,
    },
    satisfactionBadge: {
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
    },
    satisfactionBadgeActive: {
      borderColor: 'rgba(0, 255, 204, 0.3)',
      backgroundColor: 'rgba(0, 255, 204, 0.08)',
    },
    satisfactionBadgeEmpty: {
      borderColor: 'rgba(255, 255, 255, 0.07)',
      backgroundColor: 'transparent',
    },
    satisfactionBadgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    satisfactionTextActive: {
      color: '#00FFCC',
    },
    satisfactionTextEmpty: {
      color: '#7E8E9C',
    },

    // ── Fixed Bottom Action Bar ─────────────────────────────
    bottomActionBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 24 : 14,
      backgroundColor: '#050A0E',
      borderTopWidth: 1,
      borderTopColor: 'rgba(255, 255, 255, 0.07)',
    },
    newPostButton: {
      backgroundColor: '#00FFCC',
      borderRadius: 16,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    newPostButtonText: {
      color: '#050A0E',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    buttonDisabled: {
      opacity: 0.5,
    },

    // ── Create Post View ────────────────────────────────────
    createScrollView: {
      flex: 1,
    },
    createScrollContent: {
      padding: 16,
    },
    permanenceBanner: {
      backgroundColor: 'rgba(255, 102, 0, 0.08)',
      borderColor: 'rgba(255, 102, 0, 0.25)',
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 20,
    },
    permanenceBannerText: {
      color: '#FF6600',
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 19,
    },
    inputGroup: {
      marginBottom: 18,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textPrimary,
      marginBottom: 6,
    },
    requiredStar: {
      color: '#FF3366',
    },
    subjectInput: {
      backgroundColor: isDark ? '#0A1017' : '#F0F4F8',
      borderColor: 'rgba(255, 255, 255, 0.07)',
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 16,
      color: c.textPrimary,
      fontSize: 15,
      lineHeight: 22,
    },
    contentInput: {
      backgroundColor: isDark ? '#0A1017' : '#F0F4F8',
      borderColor: 'rgba(255, 255, 255, 0.07)',
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 16,
      color: c.textPrimary,
      fontSize: 15,
      lineHeight: 22,
      minHeight: 150,
    },
    attachmentToolbar: {
      marginTop: 8,
      marginBottom: 16,
    },
    toolbarTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: '#7E8E9C',
      marginBottom: 8,
    },
    toolbarButtonsRow: {
      flexDirection: 'row',
    },
    toolButton: {
      backgroundColor: isDark ? '#0D161F' : '#FFFFFF',
      borderColor: 'rgba(0, 255, 204, 0.3)',
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginRight: 10,
    },
    toolButtonText: {
      color: '#00FFCC',
      fontSize: 13,
      fontWeight: '600',
    },
    attachedSection: {
      marginTop: 10,
      marginBottom: 16,
    },
    attachedSectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 8,
    },
    thumbnailRow: {
      flexDirection: 'row',
    },
    thumbnailContainer: {
      position: 'relative',
      marginRight: 10,
    },
    thumbnailImage: {
      width: 72,
      height: 72,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.07)',
    },
    removeThumbnailButton: {
      position: 'absolute',
      top: -6,
      right: -6,
      backgroundColor: '#FF3366',
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeThumbnailText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    docItemCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? '#0D161F' : '#FFFFFF',
      borderColor: 'rgba(255, 255, 255, 0.07)',
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
    },
    docItemInfo: {
      flex: 1,
      marginRight: 8,
    },
    docItemName: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textPrimary,
    },
    docItemSize: {
      fontSize: 12,
      color: '#7E8E9C',
      marginTop: 2,
    },
    removeDocButton: {
      backgroundColor: 'rgba(255, 51, 102, 0.12)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    removeDocText: {
      color: '#FF3366',
      fontSize: 12,
      fontWeight: '700',
    },

    // ── Detail & 0–10 Rating View ───────────────────────────
    adminToggleButton: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      borderWidth: 1,
    },
    adminToggleActive: {
      backgroundColor: 'rgba(255, 102, 0, 0.12)',
      borderColor: '#FF6600',
    },
    adminToggleInactive: {
      backgroundColor: 'transparent',
      borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    adminToggleText: {
      fontSize: 12,
      fontWeight: '700',
    },
    adminToggleTextActive: {
      color: '#FF6600',
    },
    adminToggleTextInactive: {
      color: '#7E8E9C',
    },
    detailScrollView: {
      flex: 1,
    },
    detailScrollContent: {
      padding: 16,
    },
    detailAnnouncementBadge: {
      backgroundColor: 'rgba(255, 102, 0, 0.12)',
      borderColor: '#FF6600',
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      alignSelf: 'flex-start',
      marginBottom: 12,
    },
    detailAnnouncementText: {
      color: '#FF6600',
      fontSize: 12,
      fontWeight: '700',
    },
    detailSubject: {
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: c.textPrimary,
      lineHeight: 28,
      marginBottom: 14,
    },
    detailAuthorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    authorAvatarBox: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: '#00FFCC',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    authorAvatarText: {
      color: '#050A0E',
      fontSize: 18,
      fontWeight: '700',
    },
    authorMetaBox: {
      flex: 1,
    },
    detailDisplayName: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textPrimary,
    },
    detailUsername: {
      fontSize: 12,
      color: '#7E8E9C',
      marginTop: 2,
    },
    detailContentCard: {
      backgroundColor: isDark ? '#0D161F' : '#FFFFFF',
      borderRadius: 18,
      padding: 18,
      borderColor: 'rgba(255, 255, 255, 0.07)',
      borderWidth: 1,
      marginBottom: 20,
    },
    detailContentText: {
      fontSize: 15,
      lineHeight: 22,
      color: c.textPrimary,
    },
    gallerySection: {
      marginBottom: 20,
    },
    sectionHeader: {
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: c.textPrimary,
      marginBottom: 10,
    },
    galleryScroll: {
      flexDirection: 'row',
    },
    galleryImageWrapper: {
      marginRight: 12,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.07)',
    },
    galleryImage: {
      width: 220,
      height: 150,
    },
    zoomHintBadge: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      backgroundColor: '#050A0ECC',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    zoomHintText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '600',
    },
    documentsSection: {
      marginBottom: 20,
    },
    detailDocCard: {
      backgroundColor: isDark ? '#0D161F' : '#FFFFFF',
      borderColor: 'rgba(255, 255, 255, 0.07)',
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    detailDocInfo: {
      flex: 1,
      marginRight: 10,
    },
    detailDocName: {
      fontSize: 14,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 4,
    },
    detailDocMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    docTypeBadge: {
      backgroundColor: isDark ? '#16222E' : '#E8EFF5',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginRight: 8,
    },
    docTypeBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: c.textPrimary,
    },
    detailDocSize: {
      fontSize: 12,
      color: '#7E8E9C',
    },
    openDocButton: {
      backgroundColor: '#00FFCC',
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 12,
    },
    openDocButtonText: {
      color: '#050A0E',
      fontSize: 12,
      fontWeight: '700',
    },

    // ── Interactive 0–10 Rating Section ─────────────────────
    ratingSectionCard: {
      backgroundColor: isDark ? '#0D161F' : '#FFFFFF',
      borderRadius: 18,
      borderColor: 'rgba(0, 255, 204, 0.25)',
      borderWidth: 1,
      padding: 18,
      marginBottom: 20,
    },
    ratingSectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: c.textPrimary,
      marginBottom: 12,
    },
    satisfactionDisplayBox: {
      marginBottom: 18,
    },
    satisfactionTextRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    satisfactionPercentText: {
      fontSize: 32,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: '#00FFCC',
    },
    satisfactionSubtitle: {
      fontSize: 12,
      color: '#7E8E9C',
    },
    progressBarTrack: {
      height: 8,
      backgroundColor: isDark ? '#16222E' : '#DCE4EC',
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: '#00FFCC',
      borderRadius: 4,
    },
    rateInstructions: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textPrimary,
      marginBottom: 12,
    },
    numberButtonsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    numberButton: {
      width: '13%',
      aspectRatio: 1,
      borderRadius: 12,
      backgroundColor: isDark ? '#0A1017' : '#F0F4F8',
      borderColor: 'rgba(255, 255, 255, 0.07)',
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    numberButtonSelected: {
      backgroundColor: '#00FFCC',
      borderColor: '#00FFCC',
    },
    numberButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textPrimary,
    },
    numberButtonTextSelected: {
      color: '#050A0E',
    },
    yourScoreNotice: {
      backgroundColor: 'rgba(0, 255, 204, 0.08)',
      padding: 12,
      borderRadius: 12,
      marginBottom: 16,
    },
    yourScoreText: {
      fontSize: 13,
      color: c.textPrimary,
    },
    yourScoreHighlight: {
      color: '#00FFCC',
      fontWeight: '700',
    },
    othersRatingsSection: {
      borderTopWidth: 1,
      borderTopColor: 'rgba(255, 255, 255, 0.07)',
      paddingTop: 14,
    },
    othersRatingsTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 10,
    },
    noOthersText: {
      fontSize: 12,
      color: '#7E8E9C',
      fontStyle: 'italic',
    },
    ratingRowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255, 255, 255, 0.07)',
    },
    raterInfo: {
      flex: 1,
    },
    raterDisplayName: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textPrimary,
    },
    raterUsername: {
      fontSize: 12,
      color: '#7E8E9C',
    },
    raterScoreBadge: {
      backgroundColor: 'rgba(0, 255, 204, 0.1)',
      borderColor: 'rgba(0, 255, 204, 0.3)',
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    raterScoreText: {
      color: '#00FFCC',
      fontSize: 12,
      fontWeight: '700',
    },

    // ── Fullscreen Image Modal ──────────────────────────────
    fullscreenOverlay: {
      flex: 1,
      backgroundColor: '#000000FA',
      justifyContent: 'center',
      alignItems: 'center',
    },
    fullscreenCloseButton: {
      position: 'absolute',
      top: 50,
      right: 20,
      zIndex: 10,
      backgroundColor: '#FFFFFF33',
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
    },
    fullscreenCloseText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    fullscreenImage: {
      width: '95%',
      height: '80%',
    },

    // ── Attachment Modals ───────────────────────────────────
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(5, 10, 14, 0.88)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    pickerModalBox: {
      backgroundColor: isDark ? '#0D161F' : '#FFFFFF',
      borderColor: 'rgba(255, 255, 255, 0.07)',
      borderWidth: 1,
      borderRadius: 20,
      padding: 22,
      width: '100%',
      maxWidth: 420,
    },
    pickerModalTitle: {
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: c.textPrimary,
      marginBottom: 6,
    },
    pickerModalSubtitle: {
      fontSize: 13,
      color: '#7E8E9C',
      marginBottom: 14,
      lineHeight: 18,
    },
    pickerInput: {
      backgroundColor: isDark ? '#0A1017' : '#F0F4F8',
      borderColor: 'rgba(255, 255, 255, 0.07)',
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: c.textPrimary,
      fontSize: 15,
      marginBottom: 10,
    },
    modalActionButton: {
      backgroundColor: '#00FFCC',
      borderRadius: 16,
      paddingVertical: 15,
      alignItems: 'center',
      marginBottom: 14,
    },
    modalActionText: {
      color: '#050A0E',
      fontSize: 15,
      fontWeight: '700',
    },
    presetSectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: '#7E8E9C',
      marginBottom: 8,
    },
    presetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255, 255, 255, 0.07)',
    },
    presetThumb: {
      width: 36,
      height: 36,
      borderRadius: 6,
      marginRight: 10,
    },
    presetLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textPrimary,
      flex: 1,
    },
    presetDocEmoji: {
      fontSize: 22,
      marginRight: 10,
    },
    presetDocMeta: {
      fontSize: 12,
      color: '#7E8E9C',
      marginTop: 2,
    },
    nativePickerButton: {
      backgroundColor: 'rgba(0, 255, 204, 0.08)',
      borderColor: 'rgba(0, 255, 204, 0.25)',
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 8,
    },
    nativePickerText: {
      color: '#00FFCC',
      fontSize: 13,
      fontWeight: '700',
    },
    orDividerText: {
      textAlign: 'center',
      fontSize: 11,
      color: '#7E8E9C',
      marginVertical: 10,
      fontWeight: '600',
    },
    modalCloseButton: {
      marginTop: 14,
      paddingVertical: 10,
      alignItems: 'center',
    },
    modalCloseText: {
      color: '#7E8E9C',
      fontSize: 14,
      fontWeight: '600',
    },
    backButton: {
      marginTop: 16,
      paddingVertical: 12,
      paddingHorizontal: 20,
      backgroundColor: '#00FFCC',
      borderRadius: 16,
    },
    backButtonText: {
      color: '#050A0E',
      fontWeight: '700',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      paddingHorizontal: 20,
    },
    emptyEmoji: {
      fontSize: 48,
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: c.textPrimary,
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 13,
      color: '#7E8E9C',
      textAlign: 'center',
      lineHeight: 18,
    },
  });

export default PostsScreen;
