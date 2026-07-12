// 言 YAN · 发音(TTS)共享组件
// 从 App.js 抽出:useSpeech Hook + SpeakBtn 按钮。逻辑保持不变。
import { useCallback, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Speech from 'expo-speech';
import { C } from '../theme';

export function useSpeech() {
  const [speakingKey, setSpeakingKey] = useState(null);

  // expo-speech 走系统 TTS 路由,不受 iOS 静音键影响;无需初始化。
  const speak = useCallback((text, lang = 'ja-JP', key = null) => {
    if (!text) return;

    if (speakingKey === key && key !== null) {
      Speech.stop();
      setSpeakingKey(null);
      return;
    }

    Speech.stop();
    setSpeakingKey(key);

    Speech.speak(text, {
      language: lang,
      rate: 0.8,
      pitch: 1.0,
      onDone: () => setSpeakingKey(null),
      onStopped: () => setSpeakingKey(null),
      onError: (e) => {
        console.warn('[TTS]', e);
        setSpeakingKey(null);
      },
    });
  }, [speakingKey]);

  return { speak, speakingKey };
}

export function SpeakBtn({ onPress, speaking, size = 'md', color = C.lava }) {
  const scale = useRef(new Animated.Value(1)).current;

  const tap = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.85, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 3, tension: 200, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  const sm = size === 'sm';

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={tap}
        activeOpacity={0.8}
        style={[
          sb.btn,
          { borderColor: color },
          speaking && { backgroundColor: color },
          sm && sb.sm,
        ]}
      >
        {sm ? (
          <Text style={[sb.smIconTxt, { color: speaking ? C.white : color }]}>
            {speaking ? '♪' : '言'}
          </Text>
        ) : (
          <>
            <View style={sb.waves}>
              {[5, 11, 16, 11, 5].map((h, i) => (
                <View
                  key={i}
                  style={[
                    sb.bar,
                    { height: h, backgroundColor: speaking ? C.white : color },
                  ]}
                />
              ))}
            </View>
            <Text style={[sb.txt, { color: speaking ? C.white : color }]}>
              {speaking ? '播放中' : '听发音'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const sb = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1.5,
    backgroundColor: C.white,
  },
  sm: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waves: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1.5,
  },
  bar: {
    width: 1.8,
    borderRadius: 2,
  },
  txt: {
    fontSize: 13,
    fontWeight: '600',
  },
  smIconTxt: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
});
