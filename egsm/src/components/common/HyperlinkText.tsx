import React from 'react';
import {
  Text,
  Linking,
  Alert,
  StyleSheet,
  StyleProp,
  TextStyle,
} from 'react-native';

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

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

    // Clean trailing punctuation if matched
    const punctMatch = targetUrl.match(/[.,;:!?)]+$/);
    if (punctMatch) {
      targetUrl = targetUrl.slice(0, targetUrl.length - punctMatch[0].length);
    }

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

  // Tokenize the input string with URL_REGEX
  const tokens: Array<{ text: string; isUrl: boolean }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state before execution
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const matchIndex = match.index;
    const matchedStr = match[0];

    // Non-link text preceding this match
    if (matchIndex > lastIndex) {
      tokens.push({
        text: text.slice(lastIndex, matchIndex),
        isUrl: false,
      });
    }

    // Separate clean URL from trailing punctuation
    let linkStr = matchedStr;
    let trailingPunct = '';
    const punctMatch = matchedStr.match(/[.,;:!?)]+$/);
    if (punctMatch) {
      trailingPunct = punctMatch[0];
      linkStr = matchedStr.slice(0, matchedStr.length - trailingPunct.length);
    }

    if (linkStr.length > 0) {
      tokens.push({
        text: linkStr,
        isUrl: true,
      });
    }

    if (trailingPunct.length > 0) {
      tokens.push({
        text: trailingPunct,
        isUrl: false,
      });
    }

    lastIndex = matchIndex + matchedStr.length;
  }

  // Any remaining plain text after the final URL match
  if (lastIndex < text.length) {
    tokens.push({
      text: text.slice(lastIndex),
      isUrl: false,
    });
  }

  return (
    <Text style={style} numberOfLines={numberOfLines} selectable={selectable}>
      {tokens.map((token, index) => {
        if (token.isUrl) {
          return (
            <Text
              key={`link-${index}`}
              style={[styles.link, linkStyle]}
              onPress={() => handlePress(token.text)}
              suppressHighlighting={false}
            >
              {token.text}
            </Text>
          );
        }
        return (
          <Text key={`txt-${index}`} style={style}>
            {token.text}
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
