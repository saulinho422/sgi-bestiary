import { Math2, type Image, type Vector2 } from "@owlbear-rodeo/sdk";
import type { HudSettings } from "@/domain/entities/settings";

export function getImageDimensions(item: Image, sceneDpi: number) {
  const dpiScale = sceneDpi / Math.max(1, item.grid.dpi);
  return {
    width: Math.abs(item.image.width * dpiScale * item.scale.x),
    height: Math.abs(item.image.height * dpiScale * item.scale.y),
  };
}

export function getImageCenter(image: Image, sceneDpi: number): Vector2 {
  let center: Vector2 = {
    x: image.image.width * 0.5,
    y: image.image.height * 0.5,
  };
  center = Math2.subtract(center, image.grid.offset);
  center = Math2.multiply(center, sceneDpi / Math.max(1, image.grid.dpi));
  center = Math2.multiply(center, image.scale);
  center = Math2.rotate(center, { x: 0, y: 0 }, image.rotation);
  center = Math2.add(center, image.position);
  return center;
}

export function getHealthBarColor(
  ratio: number,
  settings: HudSettings,
): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped <= 0) return settings.colorThresholds.zeroColor;
  const pct = clamped * 100;
  if (pct >= settings.colorThresholds.highMinPercent) {
    return settings.colorThresholds.highColor;
  }
  if (pct >= settings.colorThresholds.mediumMinPercent) {
    return settings.colorThresholds.mediumColor;
  }
  return settings.colorThresholds.lowColor;
}

export function getFillPortion(
  ratio: number,
  segments = 0,
): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped <= 0) return 0;
  if (clamped >= 1) return 1;
  if (segments <= 0) return clamped;
  return Math.ceil(clamped * segments) / segments;
}

function drawArc(
  center: Vector2,
  radius: number,
  startAngle: number,
  arcAngle: number,
  arcPoints: number,
): Vector2[] {
  const steps = Math.max(2, arcPoints - 1);
  const points: Vector2[] = [];
  const step = arcAngle / steps;
  let angle = startAngle;
  for (let i = 0; i <= steps; i++) {
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y - radius * Math.sin(angle),
    });
    angle += step;
  }
  return points;
}

export function createRoundedRectPoints(
  maxLength: number,
  height: number,
  radius: number,
  fill = 1,
  pointsInCorner = 8,
): Vector2[] {
  const safeLength = Math.max(4, maxLength);
  const safeHeight = Math.max(4, height);
  const r = Math.min(radius, safeHeight * 0.5, safeLength * 0.5);

  if (fill >= 1) {
    return [
      { x: r, y: 0 },
      { x: safeLength - r, y: 0 },
      ...drawArc({ x: safeLength - r, y: r }, r, Math.PI * 0.5, -Math.PI * 0.5, pointsInCorner),
      ...drawArc({ x: safeLength - r, y: safeHeight - r }, r, 0, -Math.PI * 0.5, pointsInCorner),
      { x: safeLength - r, y: safeHeight },
      { x: r, y: safeHeight },
      ...drawArc({ x: r, y: safeHeight - r }, r, -Math.PI * 0.5, -Math.PI * 0.5, pointsInCorner),
      ...drawArc({ x: r, y: r }, r, -Math.PI, -Math.PI * 0.5, pointsInCorner),
    ];
  }

  const barLength = Math.max(0, fill * safeLength);
  if (barLength <= 0.5) return [];

  if (barLength < r) {
    const refAngle = Math.acos(Math.max(-1, Math.min(1, (r - barLength) / r)));
    return [
      ...drawArc({ x: r, y: safeHeight - r }, r, Math.PI + refAngle, -refAngle, pointsInCorner),
      ...drawArc({ x: r, y: r }, r, Math.PI, -refAngle, pointsInCorner),
    ];
  }

  const remaining = safeLength - barLength;
  if (remaining < r) {
    const refAngle = Math.acos(Math.max(-1, Math.min(1, (r - remaining) / r)));
    return [
      { x: r, y: 0 },
      { x: safeLength - r, y: 0 },
      ...drawArc(
        { x: safeLength - r, y: r },
        r,
        Math.PI * 0.5,
        -Math.PI * 0.5 + refAngle,
        pointsInCorner,
      ),
      ...drawArc(
        { x: safeLength - r, y: safeHeight - r },
        r,
        -refAngle,
        -Math.PI * 0.5 + refAngle,
        pointsInCorner,
      ),
      { x: safeLength - r, y: safeHeight },
      { x: r, y: safeHeight },
      ...drawArc({ x: r, y: safeHeight - r }, r, -Math.PI * 0.5, -Math.PI * 0.5, pointsInCorner),
      ...drawArc({ x: r, y: r }, r, -Math.PI, -Math.PI * 0.5, pointsInCorner),
    ];
  }

  return [
    { x: r, y: 0 },
    { x: barLength, y: 0 },
    { x: barLength, y: safeHeight },
    { x: r, y: safeHeight },
    ...drawArc({ x: r, y: safeHeight - r }, r, -Math.PI * 0.5, -Math.PI * 0.5, pointsInCorner),
    ...drawArc({ x: r, y: r }, r, -Math.PI, -Math.PI * 0.5, pointsInCorner),
  ];
}

/**
 * Pontos de um escudo heráldico compacto relativo à sua origem superior esquerda (width x height).
 */
export function createShieldPolygonPoints(width: number, height: number): Vector2[] {
  return [
    { x: width * 0.5, y: 0 },
    { x: width, y: height * 0.18 },
    { x: width * 0.92, y: height * 0.65 },
    { x: width * 0.5, y: height },
    { x: width * 0.08, y: height * 0.65 },
    { x: 0, y: height * 0.18 },
  ];
}

export interface HudLayoutGeometry {
  center: Vector2;
  bounds: { width: number; height: number };
  barTopLeft: Vector2;
  barWidth: number;
  barHeight: number;
  acCenter: Vector2;
  tempHpCenter: Vector2;
  namePosition: Vector2;
  namePointerDirection: "UP" | "DOWN";
  conditionRowStart: Vector2;
}

export function computeHudLayoutGeometry(
  image: Image,
  sceneDpi: number,
  settings: HudSettings,
): HudLayoutGeometry {
  const bounds = getImageDimensions(image, sceneDpi);
  const center = getImageCenter(image, sceneDpi);
  const barWidth = Math.max(48, bounds.width * settings.barWidthScale - 4);
  const barHeight = Math.max(8, settings.barHeight);
  const offset = settings.offsetPx;
  const badgeSize = Math.round(26 * settings.iconScale);

  let barTopLeft: Vector2;
  let namePosition: Vector2;
  let namePointerDirection: "UP" | "DOWN" = "UP";
  let conditionRowStart: Vector2;

  switch (settings.position) {
    case "top": {
      barTopLeft = {
        x: center.x - barWidth * 0.5,
        y: center.y - bounds.height * 0.5 - barHeight - offset,
      };
      namePosition = {
        x: center.x,
        y: barTopLeft.y - 4,
      };
      namePointerDirection = "DOWN";
      conditionRowStart = {
        x: barTopLeft.x,
        y: barTopLeft.y - badgeSize - 4,
      };
      break;
    }
    case "left": {
      barTopLeft = {
        x: center.x - bounds.width * 0.5 - barWidth - offset - 6,
        y: center.y - barHeight * 0.5,
      };
      namePosition = {
        x: barTopLeft.x + barWidth * 0.5,
        y: barTopLeft.y - 4,
      };
      namePointerDirection = "DOWN";
      conditionRowStart = {
        x: barTopLeft.x,
        y: barTopLeft.y + barHeight + 4,
      };
      break;
    }
    case "right": {
      barTopLeft = {
        x: center.x + bounds.width * 0.5 + offset + 6,
        y: center.y - barHeight * 0.5,
      };
      namePosition = {
        x: barTopLeft.x + barWidth * 0.5,
        y: barTopLeft.y - 4,
      };
      namePointerDirection = "DOWN";
      conditionRowStart = {
        x: barTopLeft.x,
        y: barTopLeft.y + barHeight + 4,
      };
      break;
    }
    case "bottom":
    default: {
      barTopLeft = {
        x: center.x - barWidth * 0.5,
        y: center.y + bounds.height * 0.5 + offset,
      };
      namePosition = {
        x: center.x,
        y: barTopLeft.y + barHeight + 4,
      };
      namePointerDirection = "UP";
      conditionRowStart = {
        x: barTopLeft.x,
        y: barTopLeft.y - badgeSize - 4,
      };
      break;
    }
  }

  const acCenter: Vector2 = {
    x: barTopLeft.x + barWidth - badgeSize * 0.5,
    y:
      settings.position === "top"
        ? barTopLeft.y - badgeSize * 0.5 - 4
        : barTopLeft.y - badgeSize * 0.5 - 3,
  };

  const tempHpCenter: Vector2 = {
    x: acCenter.x - badgeSize - 4,
    y: acCenter.y,
  };

  return {
    center,
    bounds,
    barTopLeft,
    barWidth,
    barHeight,
    acCenter,
    tempHpCenter,
    namePosition,
    namePointerDirection,
    conditionRowStart,
  };
}
