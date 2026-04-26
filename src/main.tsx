import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

document.addEventListener('contextmenu', e => {
  // Prevent default context menu except in inputs/textareas
  const target = e.target as HTMLElement;
  if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
    e.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
