import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/index.css";
import { ModalApp } from "./ModalApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ModalApp />
  </StrictMode>,
);
