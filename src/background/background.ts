import OBR from "@owlbear-rodeo/sdk";
import { SgiBackgroundDaemon } from "./backgroundService";

OBR.onReady(async () => {
  const daemon = new SgiBackgroundDaemon();
  await daemon.start();
  if (import.meta.env.DEV) {
    console.info("[SGI Bestiary] Background daemon inicializado.");
  }
});
