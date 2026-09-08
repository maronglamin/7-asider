import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import {
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type OtpInputProps = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  secure?: boolean;
};

export type OtpInputRef = {
  focus: () => void;
  blur: () => void;
};

export const OtpInput = forwardRef<OtpInputRef, OtpInputProps>(function OtpInput(
  {
    length = 6,
    value,
    onChange,
    onComplete,
    disabled,
    error,
    autoFocus,
    secure,
  },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.padEnd(length, ' ').split('').slice(0, length);
  const activeIndex = Math.min(value.length, length - 1);
  const cursorOpacity = useSharedValue(1);

  const focusInput = useCallback(() => {
    if (disabled) return;
    inputRef.current?.focus();
  }, [disabled]);

  useImperativeHandle(ref, () => ({
    focus: focusInput,
    blur: () => inputRef.current?.blur(),
  }));

  useEffect(() => {
    if (!autoFocus) return undefined;
    const timer = setTimeout(focusInput, 350);
    return () => clearTimeout(timer);
  }, [autoFocus, focusInput]);

  useEffect(() => {
    cursorOpacity.value = withRepeat(
      withSequence(withTiming(0, { duration: 500 }), withTiming(1, { duration: 500 })),
      -1,
      true,
    );
  }, [cursorOpacity]);

  const prevLength = useRef(0);

  useEffect(() => {
    if (value.length === length && prevLength.current < length) {
      onComplete?.(value);
    }
    prevLength.current = value.length;
  }, [value, length, onComplete]);

  const handleChange = useCallback(
    (text: string) => {
      const cleaned = text.replace(/\D/g, '').slice(0, length);
      onChange(cleaned);
    },
    [length, onChange],
  );

  const handleKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (event.nativeEvent.key === 'Backspace' && value.length > 0) {
        onChange(value.slice(0, -1));
      }
    },
    [onChange, value],
  );

  return (
    <Pressable
      style={styles.wrapper}
      onPress={focusInput}
      disabled={disabled}
      accessibilityRole="none"
    >
      <View style={styles.boxes} pointerEvents="none">
        {digits.map((digit, index) => {
          const isActive = focused && index === activeIndex && value.length < length;
          const isFilled = digit.trim().length > 0;

          return (
            <View
              key={index}
              style={[
                styles.box,
                isActive && styles.boxActive,
                isFilled && styles.boxFilled,
                error && styles.boxError,
              ]}
            >
              {isFilled ? (
                <Text style={styles.digit}>{secure ? '•' : digit}</Text>
              ) : isActive ? (
                <Cursor opacity={cursorOpacity} />
              ) : null}
            </View>
          );
        })}
      </View>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onKeyPress={handleKeyPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPressIn={focusInput}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        editable={!disabled}
        caretHidden
        showSoftInputOnFocus
        style={styles.overlayInput}
      />
    </Pressable>
  );
});

function Cursor({ opacity }: { opacity: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.cursor, style]} />;
}

const BOX_HEIGHT = 56;

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    minHeight: BOX_HEIGHT,
    width: '100%',
  },
  boxes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  box: {
    flex: 1,
    height: BOX_HEIGHT,
    minWidth: 40,
    maxWidth: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
    transform: [{ scale: 1.04 }],
  },
  boxFilled: {
    borderColor: '#16a34a',
    backgroundColor: '#ffffff',
  },
  boxError: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  digit: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  cursor: {
    width: 2,
    height: 24,
    borderRadius: 1,
    backgroundColor: '#16a34a',
  },
  overlayInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.02,
    color: 'transparent',
    fontSize: 24,
    textAlign: 'center',
  },
});
