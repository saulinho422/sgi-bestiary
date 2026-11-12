import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { BestiaryApp } from "./app/BestiaryApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BestiaryApp />
  </StrictMode>,
);
