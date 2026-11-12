import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/index.css";
import { ContextMenuApp } from "./ContextMenuApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ContextMenuApp />
  </StrictMode>,
);
