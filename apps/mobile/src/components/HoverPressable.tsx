import { createContext, useContext, useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet } from "react-native";
import tokens from "../../../../packages/shared/ui-tokens.json";
import { NativePerimeter } from "./NativePerimeter";

const ReduceMotion = createContext(true);

export function PointerMotionProvider({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    let mounted = true;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => { if (mounted) setReduced(value); },
      () => { /* Keep the reduced default if the system preference is unavailable. */ },
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return <ReduceMotion.Provider value={reduced}>{children}</ReduceMotion.Provider>;
}

const { color } = tokens;
const variants = {
  primary: { color: "#c4ffdb30", fromX: -5, fromY: 2, fromScale: .96, duration: 230 },
  secondary: { color: `${color.brand}24`, fromX: 4, fromY: 0, fromScale: .94, duration: 210 },
  icon: { color: `${color.brand}22`, fromX: 0, fromY: 0, fromScale: .74, duration: 175 },
  action: { color: `${color.brand}19`, fromX: -3, fromY: 0, fromScale: .96, duration: 170 },
  danger: { color: `${color.danger}22`, fromX: 0, fromY: 0, fromScale: .98, duration: 170 },
  navigation: { color: `${color.brand}24`, fromX: -5, fromY: 0, fromScale: .94, duration: 210 },
  product: { color: `${color.brand}17`, fromX: 0, fromY: 4, fromScale: .98, duration: 255 },
} as const;

type Props = ComponentProps<typeof Pressable> & {
  hover?: keyof typeof variants;
  hoverDisabled?: boolean;
};

/** Only the paint layer moves. The native Pressable still owns its original hit area. */
export function HoverPressable({
  hover,
  hoverDisabled,
  children,
  style,
  onPointerEnter,
  onPointerLeave,
  ...props
}: Props) {
  const reduced = useContext(ReduceMotion);
  const allowed = !reduced && !hoverDisabled && !props.disabled &&
    !props.accessibilityState?.disabled && !props.accessibilityState?.busy &&
    !props["aria-disabled"] && !props["aria-busy"];
  const [hovered, setHovered] = useState(false);
  const [progress, setProgress] = useState<Animated.Value>();
  const variantName = hover ?? (
    props.accessibilityRole === "link" || props.accessibilityRole === "tab" ? "navigation" : "action"
  );
  const variant = variants[variantName];

  useEffect(() => {
    if (!progress) return;
    if (!allowed) {
      setHovered(false);
      setProgress(undefined);
      return;
    }

    const motion = Animated.timing(progress, {
      toValue: hovered ? 1 : 0,
      duration: hovered ? variant.duration : 165,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    motion.start(({ finished }) => {
      if (finished && !hovered) setProgress(undefined);
    });
    return () => motion.stop();
  }, [allowed, hovered, progress, variant]);

  return (
    <Pressable
      {...props}
      style={style}
      onPointerEnter={allowed ? (event) => {
        onPointerEnter?.(event);
        if (event.nativeEvent.pointerType !== "mouse") return;
        setProgress((current) => current ?? new Animated.Value(0));
        setHovered(true);
      } : onPointerEnter}
      onPointerLeave={allowed ? (event) => {
        onPointerLeave?.(event);
        if (event.nativeEvent.pointerType === "mouse") setHovered(false);
      } : onPointerLeave}
    >
      {allowed && progress ? (state) => {
        const surface = StyleSheet.flatten(typeof style === "function" ? style(state) : style);
        const borderRadius = surface?.borderRadius ?? 0;
        return <>
          {typeof children === "function" ? children(state) : children}
          <Animated.View
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius,
                backgroundColor: variant.color,
                opacity: progress,
                transform: [
                  { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [variant.fromX, 0] }) },
                  { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [variant.fromY, 0] }) },
                  { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [variant.fromScale, 1] }) },
                ],
              },
            ]}
          />
          <NativePerimeter surface={surface} variant={variantName} running={hovered} opacity={progress} />
        </>;
      } : children}
    </Pressable>
  );
}
