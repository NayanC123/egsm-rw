// src/components/common/HyperlinkText.tsx
// Hermes-safe Auto-Hyperlink Tokenizer & Link Handler.
// STRICT ANTI-CRASH: Only built-in React Native primitives, string fontWeights, zero external navigation.

import React from 'react';
import {
  Text,
  Linking,
  Alert,
  StyleSheet,
  StyleProp,
  TextStyle,
} from 'react-native';

export interface HyperlinkTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
}

export const HyperlinkText: React.FC<HyperlinkTextProps> = ({
  text,
  style,
  linkStyle,
  numberOfLines,
  selectable,
}) => {
  if (!text) {
    return null;
  }

  const handlePress = async (url: string) => {
    let targetUrl = url.trim();

    if (targetUrl.toLowerCase().startsWith('www.')) {
      targetUrl = `https://${targetUrl}`;
    } else if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    try {
      const canOpen = await Linking.canOpenURL(targetUrl);
      if (canOpen) {
        await Linking.openURL(targetUrl);
      } else {
        Alert.alert('Cannot Open Link', targetUrl);
      }
    } catch {
      Alert.alert('Cannot Open Link', targetUrl);
    }
  };

  // Hermes-safe string split tokenizer with capturing groups
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = text.split(urlRegex);

  return (
    <Text style={style} numberOfLines={numberOfLines} selectable={selectable}>
      {parts.map((part, index) => {
        if (!part) return null;

        // Determine if this part matches the URL pattern
        const isUrl = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/i.test(part);

        if (isUrl) {
          // Detach any trailing punctuation from the clickable URL
          let url = part;
          let trailing = '';
          const punctMatch = part.match(/[.,;:!?)]+$/);
          if (punctMatch) {
            trailing = punctMatch[0];
            url = part.slice(0, part.length - trailing.length);
          }

          return (
            <React.Fragment key={`link-frag-${index}`}>
              <Text
                style={[styles.link, linkStyle]}
                onPress={() => handlePress(url)}
                suppressHighlighting={false}
              >
                {url}
              </Text>
              {trailing ? <Text style={style}>{trailing}</Text> : null}
            </React.Fragment>
          );
        }

        return (
          <Text key={`txt-${index}`} style={style}>
            {part}
          </Text>
        );
      })}
    </Text>
  );
};

const styles = StyleSheet.create({
  link: {
    color: '#00FFCC',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});

export default HyperlinkText;
