import * as React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

try {
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Failed to find the root element");

  // Fix for ESM/CJS interop issues where createRoot might be on .default
  const anyReactDOM = ReactDOM as any;
  const createRoot = anyReactDOM.createRoot || anyReactDOM.default?.createRoot;

  if (typeof createRoot !== 'function') {
    throw new Error("ReactDOM.createRoot is not a function. Check your react-dom version and imports.");
  }

  const root = createRoot(rootElement);

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("CRITICAL BOOT ERROR:", error);
  const rootElement = document.getElementById("root");
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="background: #050505; color: #ff4444; height: 100vh; display: flex; align-items: center; justify-content: center; font-family: monospace; padding: 20px; text-align: center;">
        <div>
          <h1 style="font-size: 20px; margin-bottom: 10px;">NEURAL BOOT FAILURE</h1>
          <p style="color: rgba(255,255,255,0.4); font-size: 12px; max-width: 400px; margin: 0 auto;">${error instanceof Error ? error.message : String(error)}</p>
          <button onclick="window.location.reload()" style="margin-top: 20px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 10px 20px; cursor: pointer;">RETRY BOOT</button>
        </div>
      </div>
    `;
  }
}

