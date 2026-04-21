import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import "swiper/swiper-bundle.css";
import "flatpickr/dist/flatpickr.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { ThemeProvider } from "./context/ThemeContext.tsx";
import { PlayerProvider } from "./context/PlayerContext.tsx";
import { SocketProvider } from "./context/SocketContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <SocketProvider>
        <PlayerProvider>
          <BrowserRouter>
            <AppWrapper>
              <App />
            </AppWrapper>
          </BrowserRouter>
        </PlayerProvider>
      </SocketProvider>
    </ThemeProvider>
  </StrictMode>,
);
