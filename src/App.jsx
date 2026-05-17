import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Boot from "./components/Boot.jsx";
import TopNav from "./components/TopNav.jsx";
import StatusLine from "./components/StatusLine.jsx";
import StatusBar from "./components/StatusBar.jsx";
import TweaksPanel from "./components/TweaksPanel.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Tablero from "./pages/Tablero.jsx";
import Analisis from "./pages/Analisis.jsx";

export default function App() {
  // El boot oculta el #boot tras 2.8s mediante CSS animation
  // pero también quitamos la clase .booting del .app tras un breve delay para el glitch de entrada
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Boot />
      <div
        className={`app contenido-app${booting ? " booting" : ""}`}
        id="app"
      >
        <TopNav />
        <StatusLine />

        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tablero" element={<Tablero />} />
          <Route path="/analisis" element={<Analisis />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>

        <StatusBar />
        <TweaksPanel />
      </div>
    </>
  );
}
