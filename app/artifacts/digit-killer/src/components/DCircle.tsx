import { useEffect, useRef } from "react";

interface DigitData {
  digit: number;
  percentage: number;
  rank: number;
}

interface DCircleProps {
  digits: DigitData[];
  currentDigit: number;
  currentPrice: number;
  size?: number;
  label?: string;
  tickCount?: number;
}

const DIGIT_COLORS: Record<number, string> = {
  0: "#00e5d4",
  1: "#448aff",
  2: "#ce93d8",
  3: "#00c853",
  4: "#ff9100",
  5: "#00e5ff",
  6: "#c6ff00",
  7: "#ff1744",
  8: "#f50057",
  9: "#ffd600",
};

function getArcColor(rank: number): string {
  if (rank === 1) return "#00ff88";
  if (rank === 2) return "#00b4ff";
  if (rank === 9) return "#ffcc00";
  if (rank === 10) return "#ff3b3b";
  return "#1e3a4a";
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

export default function DCircle({ digits, currentDigit, currentPrice, size = 280, label, tickCount }: DCircleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const targetAngleRef = useRef(0);
  const currentAngleRef = useRef(0);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const innerR = size * 0.30;
  const labelR = size * 0.47;
  const strokeW = size * 0.065;

  // Build arc data from digit percentages
  const total = digits.reduce((s, d) => s + d.percentage, 0) || 100;
  let cumAngle = 0;
  const arcs = digits.map((d) => {
    const span = (d.percentage / total) * 360;
    const start = cumAngle;
    cumAngle += span;
    return { digit: d.digit, rank: d.rank, start, end: cumAngle, span };
  });

  // Pointer angle: find arc for currentDigit
  const currentArc = arcs.find((a) => a.digit === currentDigit);
  if (currentArc) {
    targetAngleRef.current = currentArc.start + currentArc.span / 2;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    function lerp(a: number, b: number, t: number) {
      // shortest path rotation
      let diff = b - a;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;
      return a + diff * t;
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);

      // Background circle
      ctx.beginPath();
      ctx.arc(cx, cy, outerR + strokeW / 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(5,15,28,0.9)";
      ctx.fill();

      // Draw arcs
      arcs.forEach((arc) => {
        const color = getArcColor(arc.rank);
        const rad_s = ((arc.start - 90) * Math.PI) / 180;
        const rad_e = ((arc.end - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, rad_s, rad_e);
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeW;
        ctx.globalAlpha = arc.rank <= 2 || arc.rank >= 9 ? 1 : 0.25;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // Ring glow for top arc
      const topArc = arcs.find((a) => a.rank === 1);
      if (topArc) {
        const rad_s = ((topArc.start - 90) * Math.PI) / 180;
        const rad_e = ((topArc.end - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, rad_s, rad_e);
        ctx.strokeStyle = "#00ff88";
        ctx.lineWidth = strokeW + 4;
        ctx.globalAlpha = 0.12;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Digit labels around the outside
      ctx.font = `bold ${size * 0.048}px 'Orbitron', monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      arcs.forEach((arc) => {
        const midAngle = arc.start + arc.span / 2;
        const lp = polarToCartesian(cx, cy, labelR, midAngle);
        const isActive = arc.digit === currentDigit;
        ctx.fillStyle = isActive ? DIGIT_COLORS[arc.digit] : "rgba(255,255,255,0.5)";
        ctx.globalAlpha = isActive ? 1 : 0.6;
        if (isActive) {
          ctx.shadowColor = DIGIT_COLORS[arc.digit];
          ctx.shadowBlur = 8;
        }
        ctx.fillText(String(arc.digit), lp.x, lp.y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      });

      // Pointer triangle
      currentAngleRef.current = lerp(currentAngleRef.current, targetAngleRef.current, 0.12);
      const pAngle = currentAngleRef.current;
      const pRad = ((pAngle - 90) * Math.PI) / 180;
      const pDist = outerR - strokeW / 2 - 4;
      const px = cx + pDist * Math.cos(pRad);
      const py = cy + pDist * Math.sin(pRad);
      const perpRad = pRad + Math.PI / 2;
      const tw = size * 0.025;
      const tl = size * 0.05;

      ctx.beginPath();
      ctx.moveTo(px - Math.cos(pRad) * tl, py - Math.sin(pRad) * tl);
      ctx.lineTo(px + Math.cos(perpRad) * tw, py + Math.sin(perpRad) * tw);
      ctx.lineTo(px - Math.cos(perpRad) * tw, py - Math.sin(perpRad) * tw);
      ctx.closePath();
      ctx.fillStyle = "#00e5ff";
      ctx.shadowColor = "#00e5ff";
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Center current price
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `600 ${size * 0.08}px 'Space Grotesk', sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(String(currentPrice.toFixed(4)), cx, cy - size * 0.04);

      // Center current digit
      const dColor = DIGIT_COLORS[currentDigit];
      ctx.font = `900 ${size * 0.14}px 'Orbitron', monospace`;
      ctx.fillStyle = dColor;
      ctx.shadowColor = dColor;
      ctx.shadowBlur = 16;
      ctx.fillText(String(currentDigit), cx, cy + size * 0.07);
      ctx.shadowBlur = 0;

      animFrameRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [digits, currentDigit, currentPrice, size]);

  return (
    <div className="flex flex-col items-center gap-2">
      {label && (
        <div className="font-rajdhani font-semibold text-xs tracking-widest uppercase text-primary/70">
          {label}
          {tickCount !== undefined && (
            <span className="ml-2 text-muted-foreground">({tickCount} ticks)</span>
          )}
        </div>
      )}
      <div className="relative" style={{ width: size, height: size }}>
        <canvas ref={canvasRef} style={{ width: size, height: size }} />
      </div>
    </div>
  );
}

export function arcPath2(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  return arcPath(cx, cy, r, startAngle, endAngle);
}

void polarToCartesian;
