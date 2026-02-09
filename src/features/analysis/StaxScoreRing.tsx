import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { theme } from '../../utils/theme';

/** Color thresholds for the Stax Score ring. */
const SCORE_COLOR_GOOD = theme.colors.positive;
const SCORE_COLOR_WARN = '#F59E0B';
const SCORE_COLOR_BAD = theme.colors.negative;

function scoreColor(score: number): string {
  if (score >= 80) return SCORE_COLOR_GOOD;
  if (score >= 50) return SCORE_COLOR_WARN;
  return SCORE_COLOR_BAD;
}

interface StaxScoreRingProps {
  score: number;
  size?: number;
}

/**
 * Animated SVG ring that visualises the Stax Score (0-100).
 * Green >=80, amber 50-79, red <50.
 */
export function StaxScoreRing({ score, size = 140 }: StaxScoreRingProps) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score, 0), 100) / 100;
  const offset = circumference * (1 - progress);
  const color = scoreColor(score);

  return (
    <View style={styles.wrapper}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Background track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.colors.border}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Foreground arc */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={offset}
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.labelContainer]}>
          <Text style={[styles.scoreNumber, { color }]}>{score}</Text>
        </View>
      </View>
      <Text style={styles.hint}>0 = concentrated, 100 = diversified</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  labelContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreNumber: {
    ...theme.typography.title,
    fontSize: 40,
  },
  hint: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },
});
