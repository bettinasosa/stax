import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { theme } from '../../utils/theme';

export interface CandleData {
  /** Open price. */
  o: number;
  /** High price. */
  h: number;
  /** Low price. */
  l: number;
  /** Close price. */
  c: number;
  /** UNIX timestamp (seconds). */
  t: number;
}

interface Props {
  candles: CandleData[];
  width: number;
  height: number;
}

const PADDING_TOP = 8;
const PADDING_BOTTOM = 24;
const PADDING_LEFT = 4;
const PADDING_RIGHT = 4;
const WICK_COLOR_UP = '#4ECDC4';
const WICK_COLOR_DOWN = '#FF6B6B';
const BODY_COLOR_UP = '#4ECDC4';
const BODY_COLOR_DOWN = '#FF6B6B';
const MAX_CANDLES = 60;

/**
 * Minimal OHLC candlestick chart rendered with react-native-svg.
 * Green (teal) candles for close >= open, red candles otherwise.
 */
export function CandlestickChart({ candles, width, height }: Props) {
  const displayCandles = candles.length > MAX_CANDLES ? candles.slice(-MAX_CANDLES) : candles;

  const { yMin, yMax, scaleY, candleWidth, labels } = useMemo(() => {
    if (displayCandles.length === 0) {
      return { yMin: 0, yMax: 1, scaleY: () => 0, candleWidth: 0, labels: [] };
    }
    const highs = displayCandles.map((c) => c.h);
    const lows = displayCandles.map((c) => c.l);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const range = max - min || 1;
    const pad = range * 0.08;
    const adjMin = min - pad;
    const adjMax = max + pad;
    const chartH = height - PADDING_TOP - PADDING_BOTTOM;

    const scale = (v: number) => PADDING_TOP + chartH - ((v - adjMin) / (adjMax - adjMin)) * chartH;
    const cw = (width - PADDING_LEFT - PADDING_RIGHT) / displayCandles.length;

    // Build date labels (show first, middle, last)
    const formatLabel = (ts: number) => {
      const d = new Date(ts * 1000);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    const labelIndices =
      displayCandles.length >= 3
        ? [0, Math.floor(displayCandles.length / 2), displayCandles.length - 1]
        : displayCandles.map((_, i) => i);
    const lbls = labelIndices.map((i) => ({
      x: PADDING_LEFT + i * cw + cw / 2,
      text: formatLabel(displayCandles[i].t),
    }));

    return { yMin: adjMin, yMax: adjMax, scaleY: scale, candleWidth: cw, labels: lbls };
  }, [displayCandles, width, height]);

  if (displayCandles.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>No candle data available</Text>
      </View>
    );
  }

  const bodyPad = Math.max(1, candleWidth * 0.2);

  return (
    <View>
      <Svg width={width} height={height}>
        {displayCandles.map((candle, i) => {
          const x = PADDING_LEFT + i * candleWidth + candleWidth / 2;
          const isUp = candle.c >= candle.o;
          const color = isUp ? BODY_COLOR_UP : BODY_COLOR_DOWN;
          const wickColor = isUp ? WICK_COLOR_UP : WICK_COLOR_DOWN;

          const bodyTop = scaleY(Math.max(candle.o, candle.c));
          const bodyBottom = scaleY(Math.min(candle.o, candle.c));
          const bodyH = Math.max(1, bodyBottom - bodyTop);
          const wickTop = scaleY(candle.h);
          const wickBottom = scaleY(candle.l);
          const bodyW = Math.max(1, candleWidth - bodyPad * 2);

          return (
            <React.Fragment key={candle.t}>
              {/* Wick (high to low) */}
              <Line
                x1={x}
                y1={wickTop}
                x2={x}
                y2={wickBottom}
                stroke={wickColor}
                strokeWidth={1}
              />
              {/* Body (open to close) */}
              <Rect
                x={x - bodyW / 2}
                y={bodyTop}
                width={bodyW}
                height={bodyH}
                fill={color}
                rx={1}
              />
            </React.Fragment>
          );
        })}
        {/* Date labels */}
        {labels.map((lbl, i) => (
          <SvgText
            key={i}
            x={lbl.x}
            y={height - 4}
            fontSize={9}
            fill={theme.colors.textTertiary}
            textAnchor="middle"
          >
            {lbl.text}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
  },
});
