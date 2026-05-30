import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import logoPath from "@assets/WhatsApp_Image_2026-05-30_at_19.05.28_1780157146139.jpeg";

const STEPS = [
  "INITIALIZING TRADING ENGINE...",
  "CONNECTING TO DERIV FEED...",
  "LOADING AI MODELS...",
  "CALIBRATING DIGIT ANALYSIS...",
  "SYSTEM READY",
];

export default function SplashPage() {
  const [, setLocation] = useLocation();
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let p = 0;
    const interval = setInterval(() => {
      p += 2;
      setProgress(Math.min(p, 100));
      setStep(Math.floor((Math.min(p, 100) / 100) * (STEPS.length - 1)));
      if (p >= 100) {
        clearInterval(interval);
        setDone(true);
        setTimeout(() => setLocation("/dashboard"), 600);
      }
    }, 40);
    return () => clearInterval(interval);
  }, [setLocation]);

  return (
    <div className="loading-screen fixed inset-0 flex flex-col items-center justify-center z-50 bg-[#020a10]">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,229,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,100,120,0.2) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-sm px-6">
        {/* Logo */}
        <div
          className={`transition-all duration-700 ${done ? "scale-110 opacity-0" : "scale-100 opacity-100"}`}
        >
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full animate-spin-slow"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 70%, rgba(0,229,255,0.6) 85%, transparent 100%)",
                borderRadius: "50%",
              }}
            />
            <img
              src={logoPath}
              alt="Digit Killer"
              className="w-28 h-28 rounded-full object-cover relative z-10 border-2 border-primary/40"
              style={{ boxShadow: "0 0 30px rgba(0,229,255,0.4)" }}
              data-testid="img-splash-logo"
            />
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-1">
          <h1
            className="font-orbitron text-4xl font-black tracking-widest text-transparent bg-clip-text"
            style={{ backgroundImage: "linear-gradient(135deg, #00e5ff, #00ff88, #00b4ff)" }}
            data-testid="text-splash-title"
          >
            DIGIT KILLER
          </h1>
          <p className="font-rajdhani text-xs tracking-[0.3em] text-muted-foreground uppercase">
            AHMED SYNTRADER · AI TRADING SYSTEM
          </p>
        </div>

        {/* Progress */}
        <div className="w-full space-y-3">
          <div className="relative h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-100"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #00b4ff, #00e5ff)",
                boxShadow: "0 0 8px rgba(0,229,255,0.8)",
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span
              className="font-rajdhani text-xs text-primary tracking-wider animate-blink"
              data-testid="text-splash-step"
            >
              {STEPS[step]}
            </span>
            <span className="font-orbitron text-xs text-muted-foreground">
              {progress}%
            </span>
          </div>
        </div>

        {/* Corner decorations */}
        <div className="absolute top-6 left-6 w-12 h-12 border-t-2 border-l-2 border-primary/30" />
        <div className="absolute top-6 right-6 w-12 h-12 border-t-2 border-r-2 border-primary/30" />
        <div className="absolute bottom-6 left-6 w-12 h-12 border-b-2 border-l-2 border-primary/30" />
        <div className="absolute bottom-6 right-6 w-12 h-12 border-b-2 border-r-2 border-primary/30" />
      </div>
    </div>
  );
}
