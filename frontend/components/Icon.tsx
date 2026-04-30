import React from 'react';
import { Platform, Text, View, StyleSheet } from 'react-native';

// Only import Ionicons on native platforms
let Ionicons: any = null;
if (Platform.OS !== 'web') {
  Ionicons = require('@expo/vector-icons').Ionicons;
}

// Emoji/Unicode mappings for web (Safari-safe)
const ICON_MAP: Record<string, string> = {
  // Navigation & Actions
  'add-circle': '＋',
  'add': '+',
  'close': '✕',
  'close-circle': '✕',
  'checkmark': '✓',
  'checkmark-circle': '✓',
  'chevron-back': '‹',
  'chevron-forward': '›',
  'chevron-down': '▾',
  'search': '🔍',
  'save': '💾',
  'sync': '↻',
  'trash': '🗑',
  'trash-outline': '🗑',
  'eye': '👁',
  'eye-off': '◌',
  
  // Communication
  'mail': '✉',
  'send': '➤',
  
  // Content
  'document': '📄',
  'document-text': '📄',
  'document-text-outline': '📄',
  'text': 'T',
  'pencil': '✎',
  'create-outline': '✎',
  'images': '🖼',
  'camera': '📷',
  'camera-outline': '📷',
  
  // Status & Info
  'alert-circle': '⚠',
  'warning': '⚠',
  'information-circle': 'ℹ',
  'stats-chart': '📊',
  
  // Location & Time
  'location': '📍',
  'location-outline': '📍',
  'map-outline': '🗺',
  'navigate-outline': '➤',
  'time-outline': '⏱',
  'calendar-outline': '📅',
  
  // People & Business
  'people-outline': '👥',
  'briefcase-outline': '💼',
  'business': '🏢',
  
  // Tech & Settings
  'settings': '⚙',
  'server': '🖥',
  'cloud-outline': '☁',
  'cloud-download': '⬇',
  
  // Default
  'default': '•',
};

interface WebIconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}

export default function Icon({ name, size = 20, color = '#000', style }: WebIconProps) {
  if (Platform.OS !== 'web' && Ionicons) {
    return <Ionicons name={name} size={size} color={color} style={style} />;
  }

  // Web: use emoji/text rendering (Safari-safe, no font dependency)
  const emoji = ICON_MAP[name] || ICON_MAP['default'];
  
  return (
    <Text
      style={[
        {
          fontSize: size * 0.85,
          color: color,
          textAlign: 'center',
          lineHeight: size,
          width: size,
          height: size,
        },
        style,
      ]}
      selectable={false}
    >
      {emoji}
    </Text>
  );
}
