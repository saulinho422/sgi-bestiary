import OBR, {
  buildCurve,
  buildLabel,
  buildShape,
  buildText,
} from "@owlbear-rodeo/sdk";
import { CurveBuilder } from "@owlbear-rodeo/sdk/lib/builders/CurveBuilder";
import { LabelBuilder } from "@owlbear-rodeo/sdk/lib/builders/LabelBuilder";
import { ShapeBuilder } from "@owlbear-rodeo/sdk/lib/builders/ShapeBuilder";
import { TextBuilder } from "@owlbear-rodeo/sdk/lib/builders/TextBuilder";
import type PlayerApi from "@owlbear-rodeo/sdk/lib/api/PlayerApi";

const OFFLINE_PLAYER_STUB = { id: "sgi-offline-player" } as unknown as PlayerApi;

function canUseSdkBuilders(): boolean {
  if (!OBR.isAvailable) return false;
  try {
    void OBR.player.id;
    return true;
  } catch {
    return false;
  }
}

export function safeBuildCurve(): CurveBuilder {
  return canUseSdkBuilders() ? buildCurve() : new CurveBuilder(OFFLINE_PLAYER_STUB);
}

export function safeBuildShape(): ShapeBuilder {
  return canUseSdkBuilders() ? buildShape() : new ShapeBuilder(OFFLINE_PLAYER_STUB);
}

export function safeBuildText(): TextBuilder {
  return canUseSdkBuilders() ? buildText() : new TextBuilder(OFFLINE_PLAYER_STUB);
}

export function safeBuildLabel(): LabelBuilder {
  return canUseSdkBuilders() ? buildLabel() : new LabelBuilder(OFFLINE_PLAYER_STUB);
}
