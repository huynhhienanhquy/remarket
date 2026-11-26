import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import type { ViewStyle } from "react-native";
import tokens from "../../../../packages/shared/ui-tokens.json";

const green = tokens.color.brand;
const red = tokens.color.danger;
const palettes = {
  primary: [green, "#72db96", "#f4ffd5", 2000],
  secondary: [green, "#52be8d", "#c2f6bd", 2400],
  icon: ["#13788a", "#57daea", "#d9ffff", 1850],
  action: [green, "#4abc89", "#a4ffc8", 2150],
  danger: [red, "#ec7770", "#ffe1d6", 2700],
  navigation: [green, "#63ce9d", "#d8ffeb", 2350],
  product: [green, "#54c895", "#c5ffc3", 3000],
} as const;

export type NativePerimeterVariant = keyof typeof palettes;

type Point = { x: number; y: number };
type Radii = [number, number, number, number];
const INSET = 2;
const SPARKS = [
  { phase: .94, size: 1.7, opacity: .55, color: 0 },
  { phase: .97, size: 2.6, opacity: .9, color: 1 },
  { phase: 0, size: 3.4, opacity: 1, color: 2 },
] as const;
const COUNTER_SPARKS = [
  { phase: .47, size: 1.8, opacity: .63, color: "#197f9b" },
  { phase: .5, size: 2.6, opacity: .93, color: "#8eeffa" },
] as const;
const DUAL = new Set<NativePerimeterVariant>(["primary", "secondary", "product"]);

function cornerRadius(value: ViewStyle["borderRadius"], size: number) {
  return typeof value === "number" ? Math.max(0, value)
    : Math.max(0, (Number.parseFloat(value ?? "0") || 0) * size / 100);
}

function route(width: number, height: number, corners: Radii) {
  if (width <= INSET * 2 || height <= INSET * 2) return null;
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const fit = Math.min(1, width / (topLeft + topRight), width / (bottomLeft + bottomRight),
    height / (topLeft + bottomLeft), height / (topRight + bottomRight));
  const points: Point[] = [];

  function corner(radius: number, x: number, y: number, angle: number) {
    const r = Math.max(0, radius * fit - INSET);
    const centerX = x === 0 ? INSET + r : width - INSET - r;
    const centerY = y === 0 ? INSET + r : height - INSET - r;
    const steps = r ? Math.max(4, Math.ceil(r / 2)) : 1;
    for (let step = 0; step <= steps; step++) {
      const a = (angle + 90 * step / steps) * Math.PI / 180;
      points.push({ x: centerX + Math.cos(a) * r, y: centerY + Math.sin(a) * r });
    }
  }

  corner(topRight, 1, 0, -90);
  corner(bottomRight, 1, 1, 0);
  corner(bottomLeft, 0, 1, 90);
  corner(topLeft, 0, 0, 180);
  points.push(points[0]!);

  const x: number[] = [];
  const y: number[] = [];
  const stops: number[] = [];
  let distance = 0;
  let previous: Point | undefined;
  for (const point of points) {
    const length = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
    if (previous && length < .001) continue;
    distance += length;
    x.push(point.x);
    y.push(point.y);
    stops.push(distance);
    previous = point;
  }
  return { x, y, stops: stops.map((stop) => stop / distance) };
}

/** Only the active hover mounts a measured path. Timing and interpolation run natively. */
export function NativePerimeter({ surface, variant, running, opacity }: {
  surface?: Readonly<Partial<ViewStyle>> | null;
  variant: NativePerimeterVariant;
  running: boolean;
  opacity: Animated.Value;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [phase] = useState(() => new Animated.Value(0));
  const [ignition] = useState(() => new Animated.Value(0));
  const didIgnite = useRef(false);
  const colors = palettes[variant];
  const { width, height } = size;
  const sizeBase = Math.min(width, height);
  const base = surface?.borderRadius ?? 0;
  const tl = cornerRadius(surface?.borderTopLeftRadius ?? base, sizeBase);
  const tr = cornerRadius(surface?.borderTopRightRadius ?? base, sizeBase);
  const br = cornerRadius(surface?.borderBottomRightRadius ?? base, sizeBase);
  const bl = cornerRadius(surface?.borderBottomLeftRadius ?? base, sizeBase);
  const geometry = useMemo(() => route(width, height, [tl, tr, br, bl]), [width, height, tl, tr, br, bl]);

  useEffect(() => {
    if (!running || !geometry) return;
    const orbit = Animated.loop(Animated.timing(phase, {
      toValue: 1,
      duration: colors[3],
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    }));
    orbit.start();
    return () => orbit.stop();
  }, [colors, geometry, phase, running]);

  useEffect(() => {
    if (!running || !geometry || didIgnite.current) return;
    didIgnite.current = true;
    const burst = Animated.timing(ignition, {
      toValue: 1,
      duration: 590,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    });
    burst.start();
    return () => {
      burst.stop();
      ignition.setValue(1);
    };
  }, [geometry, ignition, running]);

  function spark(key: string | number, position: Animated.AnimatedInterpolation<number>, size: number,
    color: string, brightness: number | Animated.AnimatedInterpolation<number>) {
    if (!geometry) return null;
    return (
      <Animated.View key={key} style={{
        position: "absolute",
        top: -size / 2,
        left: -size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        opacity: brightness,
        backgroundColor: color,
        transform: [
          { translateX: position.interpolate({ inputRange: geometry.stops, outputRange: geometry.x }) },
          { translateY: position.interpolate({ inputRange: geometry.stops, outputRange: geometry.y }) },
        ],
      }} />
    );
  }

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={({ nativeEvent: { layout } }) => {
        setSize((current) => current.width === layout.width && current.height === layout.height
          ? current : { width: layout.width, height: layout.height });
      }}
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      {geometry && SPARKS.map(({ phase: shift, size, opacity, color }) =>
        spark(shift, Animated.modulo(Animated.add(phase, shift), 1), size, colors[color], opacity))}
      {geometry && DUAL.has(variant) && COUNTER_SPARKS.map(({ phase: shift, size, opacity, color }) =>
        spark(shift, Animated.modulo(Animated.subtract(shift, Animated.multiply(phase, 2)), 1), size, color, opacity))}
      {geometry && spark("ignition", ignition.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }), 4.1, colors[2],
        ignition.interpolate({ inputRange: [0, .14, 1], outputRange: [0, .84, 0] }))}
    </Animated.View>
  );
}
