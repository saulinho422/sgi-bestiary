import OBR from "@owlbear-rodeo/sdk";
import {
  rollDiceExpression,
  type DiceRollResult,
} from "@/domain/rules/dnd5eRules";
import { BROADCAST_CHANNELS } from "@/utils/pluginId";

export interface RollLogEntry {
  id: string;
  actorName: string;
  label: string;
  result: DiceRollResult;
  visibility: "public" | "gm-only";
  rollerName: string;
  timestamp: string;
}

export interface DiceExtensionAdapter {
  name: string;
  onRoll?: (entry: RollLogEntry) => Promise<void> | void;
}

const LOCAL_ROLL_CHANNEL = "sgi-bestiary-local-rolls";
const adapters: DiceExtensionAdapter[] = [];

export function registerDiceAdapter(adapter: DiceExtensionAdapter): () => void {
  adapters.push(adapter);
  return () => {
    const idx = adapters.indexOf(adapter);
    if (idx >= 0) adapters.splice(idx, 1);
  };
}

export async function performRoll(params: {
  actorName: string;
  label: string;
  expression: string;
  mode?: "normal" | "advantage" | "disadvantage";
  visibility?: "public" | "gm-only";
}): Promise<RollLogEntry> {
  const result = rollDiceExpression(params.expression, {
    mode: params.mode ?? "normal",
  });

  let rollerName = "Mestre";
  if (OBR.isAvailable) {
    try {
      rollerName = await OBR.player.getName();
    } catch {
      rollerName = "Jogador";
    }
  }

  const entry: RollLogEntry = {
    id: crypto.randomUUID(),
    actorName: params.actorName,
    label: params.label,
    result,
    visibility: params.visibility ?? "public",
    rollerName,
    timestamp: new Date().toISOString(),
  };

  // Notifica iframes locais do SGI Bestiary (action, modal, etc.)
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const ch = new BroadcastChannel(LOCAL_ROLL_CHANNEL);
      ch.postMessage(entry);
      ch.close();
    } catch {
      // ignora se indisponível
    }
  }

  // Envia via OBR.broadcast apenas se público (ou LOCAL se privado)
  if (OBR.isAvailable) {
    try {
      if (entry.visibility === "public") {
        await OBR.broadcast.sendMessage(BROADCAST_CHANNELS.DICE_ROLL, entry, {
          destination: "ALL",
        });
      } else {
        await OBR.broadcast.sendMessage(BROADCAST_CHANNELS.DICE_ROLL, entry, {
          destination: "LOCAL",
        });
      }
    } catch {
      // ignora falha transitória de rede
    }
  }

  for (const adapter of adapters) {
    try {
      await adapter.onRoll?.(entry);
    } catch {
      // adaptador opcional não deve quebrar a rolagem
    }
  }

  return entry;
}

export function subscribeRollEvents(
  handler: (entry: RollLogEntry) => void,
): () => void {
  const seen = new Set<string>();
  const dispatchUnique = (entry: RollLogEntry) => {
    if (!entry?.id || seen.has(entry.id)) return;
    seen.add(entry.id);
    if (seen.size > 200) {
      const first = seen.values().next().value;
      if (first) seen.delete(first);
    }
    handler(entry);
  };

  let unsubObr = () => {};
  if (OBR.isAvailable) {
    try {
      unsubObr = OBR.broadcast.onMessage(
        BROADCAST_CHANNELS.DICE_ROLL,
        (event) => {
          const data = event.data as RollLogEntry | undefined;
          if (data) dispatchUnique(data);
        },
      );
    } catch {
      unsubObr = () => {};
    }
  }

  let ch: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      ch = new BroadcastChannel(LOCAL_ROLL_CHANNEL);
      ch.addEventListener("message", (ev: MessageEvent<RollLogEntry>) => {
        if (ev.data) dispatchUnique(ev.data);
      });
    } catch {
      ch = null;
    }
  }

  return () => {
    unsubObr();
    ch?.close();
  };
}
