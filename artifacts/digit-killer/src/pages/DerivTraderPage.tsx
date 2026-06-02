import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSymbol } from "@/context/SymbolContext";
import {
  LineChart, RefreshCw, Wifi, WifiOff, Play, Square, Bot,
  AlertCircle, TrendingUp, TrendingDown, Settings2, X, ChevronDown, User,
} from "lucide-react";

/* ── Deriv WS helpers ─────────────────────────────────────────────────────── */
const DERIV_WS_LEGACY = "wss://ws.binaryws.com/websockets/v3?app_id=1089";
const DERIV_WS_BETA   = "wss://ws.derivws.com/websockets/v3?app_id=1089";

const CONTRACT_LABELS: Record<string, string> = {
  DIGITEVEN:"Even", DIGITODD:"Odd", DIGITOVER:"Over", DIGITUNDER:"Under",
  DIGITMATCH:"Match", DIGITDIFF:"Differ", CALL:"Rise", PUT:"Fall",
};
const TRADE_TYPES = [
  { key:"DIGITEVEN", label:"Even", color:"#22c55e" },
  { key:"DIGITODD",  label:"Odd",  color:"#fb8c00" },
  { key:"DIGITOVER", label:"Over", color:"#3b82f6" },
  { key:"DIGITUNDER",label:"Under",color:"#a855f7" },
  { key:"DIGITMATCH",label:"Match",color:"#facc15" },
  { key:"DIGITDIFF", label:"Differ",color:"#ef4444" },
  { key:"CALL",      label:"Rise", color:"#00c853" },
  { key:"PUT",       label:"Fall", color:"#ff1744" },
];

const DIGIT_COLORS: Record<number, string> = {
  0:"#00897b",1:"#1e88e5",2:"#8e24aa",3:"#43a047",4:"#fb8c00",
  5:"#00e5ff",6:"#c6e500",7:"#e53935",8:"#e91e8c",9:"#fdd835",
};

const TRACKED_SYMBOLS = [
  { key:"R_10",     label:"Volatility 10",   group:"Vol" },
  { key:"R_25",     label:"Volatility 25",   group:"Vol" },
  { key:"R_50",     label:"Volatility 50",   group:"Vol" },
  { key:"R_75",     label:"Volatility 75",   group:"Vol" },
  { key:"R_100",    label:"Volatility 100",  group:"Vol" },
  { key:"1HZ10V",   label:"Vol 10 (1s)",     group:"1s"  },
  { key:"1HZ25V",   label:"Vol 25 (1s)",     group:"1s"  },
  { key:"1HZ50V",   label:"Vol 50 (1s)",     group:"1s"  },
  { key:"1HZ75V",   label:"Vol 75 (1s)",     group:"1s"  },
  { key:"1HZ100V",  label:"Vol 100 (1s)",    group:"1s"  },
  { key:"CRASH300N",label:"Crash 300",       group:"C/B" },
  { key:"CRASH500", label:"Crash 500",       group:"C/B" },
  { key:"CRASH1000",label:"Crash 1000",      group:"C/B" },
  { key:"BOOM300N", label:"Boom 300",        group:"C/B" },
  { key:"BOOM500",  label:"Boom 500",        group:"C/B" },
  { key:"BOOM1000", label:"Boom 1000",       group:"C/B" },
  { key:"JD10",     label:"Jump 10",         group:"Jmp" },
  { key:"JD25",     label:"Jump 25",         group:"Jmp" },
  { key:"JD50",     label:"Jump 50",         group:"Jmp" },
  { key:"JD75",     label:"Jump 75",         group:"Jmp" },
  { key:"JD100",    label:"Jump 100",        group:"Jmp" },
];
const GROUPS = ["Vol","1s","C/B","Jmp"] as const;

interface SymbolStat {
  key:string;label:string;group:string;price:number;digit:number;
  digitFreq:number[];tickCount:number;lastUpdate:number;
}
interface AccountInfo { loginid:string;currency:string;balance:number;is_virtual:boolean; }
interface AccountItem  { loginid:string;currency:string;is_virtual:number;token?:string; }
interface AiSignal     { contract_type:string;direction:string;ticks:number;confidence:number;barrier?:number;digit?:number;reason:string; }

/* ── Multi-symbol feed ───────────────────────────────────────────────────── */
function useMultiSymbolFeed(symbols: typeof TRACKED_SYMBOLS, activeGroup: string) {
  const [stats, setStats] = useState<Map<string,SymbolStat>>(() => new Map());
  const esSources = useRef<Map<string,EventSource>>(new Map());
  const dead = useRef(false);
  useEffect(() => {
    dead.current = false;
    const group = symbols.filter((s) => s.group === activeGroup);
    for (const [key,es] of esSources.current) {
      if (!group.some((s) => s.key === key)) { es.close(); esSources.current.delete(key); }
    }
    group.forEach(({ key, label, group:grp }) => {
      if (esSources.current.has(key)) return;
      const open = () => {
        if (dead.current) return;
        const es = new EventSource(`/api/live-ticks?symbol=${encodeURIComponent(key)}`);
        esSources.current.set(key, es);
        es.onmessage = (e) => {
          if (dead.current) return;
          try {
            const { price, digit } = JSON.parse(e.data) as { price:number;digit:number };
            setStats((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              const freq = existing?.digitFreq ?? Array(10).fill(0);
              const newFreq = [...freq];
              newFreq[digit] = (newFreq[digit] ?? 0) + 1;
              const total = newFreq.reduce((s,v) => s+v,0);
              const capped = total > 1000 ? newFreq.map((v) => Math.round((v/total)*1000)) : newFreq;
              next.set(key,{ key,label,group:grp,price,digit,digitFreq:capped,tickCount:Math.min(total,1000),lastUpdate:Date.now() });
              return next;
            });
          } catch {}
        };
        es.onerror = () => { es.close(); esSources.current.delete(key); if (!dead.current) setTimeout(open,3000); };
      };
      open();
    });
    return () => { dead.current=true; for (const es of esSources.current.values()) es.close(); esSources.current.clear(); };
  }, [activeGroup, symbols]);
  return stats;
}

/* ── Deriv WS hook ───────────────────────────────────────────────────────── */
function useDerivWS(token: string | null) {
  const ws = useRef<WebSocket|null>(null);
  const [status, setStatus] = useState<"disconnected"|"connecting"|"authorizing"|"connected">("disconnected");
  const [account, setAccount] = useState<AccountInfo|null>(null);
  const [accountList, setAccountList] = useState<AccountItem[]>([]);
  const [balance, setBalance] = useState<number|null>(null);
  const [error, setError] = useState<string|null>(null);
  const reqId = useRef(1);
  const listeners = useRef<Map<number,(m:Record<string,unknown>)=>void>>(new Map());

  const request = useCallback((msg:Record<string,unknown>):Promise<Record<string,unknown>> =>
    new Promise((resolve,reject) => {
      const id = reqId.current++;
      listeners.current.set(id,(r) => { if(r.error) reject(new Error((r.error as Record<string,string>)?.message)); else resolve(r); });
      ws.current?.send(JSON.stringify({...msg,req_id:id}));
      setTimeout(()=>{ listeners.current.delete(id); reject(new Error("timeout")); },20000);
    }),[]);

  const connect = useCallback((t:string) => {
    ws.current?.close();
    setStatus("connecting"); setError(null);
    const url = t.startsWith("pat_") ? DERIV_WS_BETA : DERIV_WS_LEGACY;
    const socket = new WebSocket(url);
    ws.current = socket;
    socket.onopen = () => { setStatus("authorizing"); socket.send(JSON.stringify({ authorize:t, req_id:reqId.current++ })); };
    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as Record<string,unknown>;
        const id = msg.req_id as number;
        if (listeners.current.has(id)) { listeners.current.get(id)!(msg); listeners.current.delete(id); }
        if (msg.msg_type === "authorize") {
          const auth = msg.authorize as Record<string,unknown>;
          setAccount({ loginid:auth.loginid as string, currency:auth.currency as string, balance:auth.balance as number, is_virtual:(auth.is_virtual as number)===1 });
          setBalance(auth.balance as number);
          setStatus("connected");
          setAccountList((auth.account_list as AccountItem[]) ?? []);
          socket.send(JSON.stringify({ balance:1,subscribe:1,req_id:reqId.current++ }));
        }
        if (msg.msg_type === "balance") setBalance(((msg.balance as Record<string,unknown>).balance) as number);
        if (msg.msg_type === "error" || msg.error) { setError((msg.error as Record<string,string>)?.message??"Error"); setStatus("disconnected"); }
      } catch {}
    };
    socket.onclose = () => { setStatus("disconnected"); setAccount(null); setBalance(null); };
    socket.onerror = () => { setError("Connection failed"); setStatus("disconnected"); };
  },[]);

  const disconnect = useCallback(() => { ws.current?.close(); ws.current=null; setStatus("disconnected"); setAccount(null); setBalance(null); setError(null); },[]);
  useEffect(()=>()=>{ ws.current?.close(); },[]);
  return { status,account,accountList,balance,error,connect,disconnect,request };
}

/* ── Floating Digit Circles (Deriv.com style) ────────────────────────────── */
function FloatingDigitCircles({ digitFreq, tickCount, currentDigit }: {
  digitFreq:number[]; tickCount:number; currentDigit:number;
}) {
  const total = tickCount || 1;
  const pcts = Array.from({ length:10 },(_,i) => (digitFreq[i]??0)/total*100);
  const mostFreq = pcts.indexOf(Math.max(...pcts));
  const leastFreq = pcts.indexOf(Math.min(...pcts));
  const R = 26; const CX = 32; const CY = 32;
  const circ = 2*Math.PI*R;
  return (
    <div className="flex justify-between items-end px-1 py-2">
      {Array.from({ length:10 },(_,d) => {
        const pct = pcts[d];
        const isCurrent = d === currentDigit;
        const isMost    = d === mostFreq;
        const isLeast   = d === leastFreq;
        const filled    = circ * (pct/100);
        const color     = isMost ? "#22c55e" : isLeast ? "#ef4444" : isCurrent ? "#ff1e9e" : "rgba(255,255,255,0.35)";
        return (
          <div key={d} className="flex flex-col items-center" style={{ minWidth:0 }}>
            <svg viewBox="0 0 64 64" style={{ width:"clamp(40px,5.5vw,58px)", height:"clamp(40px,5.5vw,58px)",
              filter: isCurrent ? `drop-shadow(0 0 10px #ff1e9e)` : undefined }}>
              <circle cx={CX} cy={CY} r={R} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth={3}/>
              <circle cx={CX} cy={CY} r={R} fill="none" stroke={color}
                strokeWidth={isCurrent ? 7 : 5} strokeLinecap="round"
                strokeDasharray={`${filled} ${circ-filled}`}
                transform={`rotate(-90 ${CX} ${CY})`}
                style={{ transition:"stroke-dasharray 0.5s ease" }}/>
              <text x={CX} y={CY+1} textAnchor="middle" dominantBaseline="middle"
                fill={isCurrent?"#fff":"rgba(255,255,255,0.8)"}
                fontFamily="Orbitron,monospace" fontWeight={isCurrent?"900":"700"}
                fontSize={isCurrent?14:12}>
                {d}
              </text>
            </svg>
            <div className="font-orbitron text-center font-bold mt-0.5"
              style={{ fontSize:"clamp(7px,1vw,10px)",
                color: isMost?"#22c55e":isLeast?"#ef4444":isCurrent?"#ff1e9e":"rgba(255,255,255,0.4)" }}>
              {pct.toFixed(1)}%
            </div>
            {isCurrent ? (
              <svg width={10} height={7} viewBox="0 0 10 7" style={{ marginTop:2 }}>
                <polygon points="5,0 10,7 0,7" fill="#ff1e9e"/>
              </svg>
            ) : (isMost || isLeast) ? (
              <div style={{ width:14,height:3,background:isMost?"#22c55e":"#ef4444",borderRadius:2,marginTop:2,marginLeft:"auto",marginRight:"auto" }}/>
            ) : <div style={{ height:9 }}/>}
          </div>
        );
      })}
    </div>
  );
}

/* ── Small symbol card ───────────────────────────────────────────────────── */
function SymbolCard({ stat, isSelected, onClick }: { stat:SymbolStat;isSelected:boolean;onClick:()=>void }) {
  const total = stat.tickCount||1;
  const sorted = useMemo(()=>[...Array.from({length:10},(_,d)=>({ d,c:stat.digitFreq[d]??0 }))].sort((a,b)=>b.c-a.c),[stat.digitFreq]);
  const role=(d:number)=>{ const i=sorted.findIndex((x)=>x.d===d); return i===0?"most":i===1?"second":i===9?"least":i===8?"sl":"mid"; };
  const rc={ most:"#22c55e",second:"#3b82f6",sl:"#facc15",least:"#ef4444",mid:"rgba(255,255,255,0.2)" };
  const isStale = Date.now()-stat.lastUpdate>5000;
  return (
    <div onClick={onClick} className="cyber-card p-3 cursor-pointer transition-all hover:scale-[1.01]"
      style={{ border:isSelected?"1px solid rgba(0,229,255,0.5)":undefined, boxShadow:isSelected?"0 0 16px rgba(0,229,255,0.1)":undefined }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="font-rajdhani text-xs font-semibold text-muted-foreground truncate">{stat.label}</div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background:isStale?"#ef4444":"#22c55e", animation:isStale?undefined:"pulse 2s infinite" }}/>
          <div className="w-7 h-7 rounded-full flex items-center justify-center font-orbitron text-sm font-black text-white"
            style={{ background:DIGIT_COLORS[stat.digit], boxShadow:`0 0 8px ${DIGIT_COLORS[stat.digit]}70` }}>
            {stat.digit}
          </div>
        </div>
      </div>
      <div className="font-orbitron text-xs font-bold text-foreground mb-1.5">
        {stat.price>100 ? stat.price.toFixed(2) : stat.price.toFixed(4)}
      </div>
      <div className="flex gap-0.5 items-end h-8">
        {Array.from({length:10},(_,d)=>{
          const pct=(stat.digitFreq[d]??0)/total*100;
          const r=role(d); const c=rc[r];
          return <div key={d} className="flex-1 rounded-t-sm transition-all duration-500"
            style={{ height:`${Math.max(3,pct/100*32)}px`, background:c, opacity:d===stat.digit?1:0.7 }}/>;
        })}
      </div>
      <div className="font-rajdhani text-[9px] text-right text-muted-foreground mt-0.5">{stat.tickCount} ticks</div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function DerivTraderPage() {
  const { symbol, setSymbol } = useSymbol();
  const [activeGroup, setActiveGroup]         = useState<string>("Vol");
  const [tokenInput, setTokenInput]           = useState(() => localStorage.getItem("deriv_token")??"");
  const [contractType, setContractType]       = useState("DIGITEVEN");
  const [stake, setStake]                     = useState(1);
  const [ticks, setTicks]                     = useState(1);
  const [barrier, setBarrier]                 = useState(4);
  const [targetDigit, setTargetDigit]         = useState(0);
  const [autoTrade, setAutoTrade]             = useState(false);
  const [trading, setTrading]                 = useState(false);
  const [martingaleOn, setMartingaleOn]       = useState(false);
  const [martMult, setMartMult]               = useState(2);
  const [lossStreak, setLossStreak]           = useState(0);
  const [sessionPL, setSessionPL]             = useState(0);
  const [showSettings, setShowSettings]       = useState(false);
  const [trades, setTrades]                   = useState<Array<{ id:string;type:string;stake:number;profit:number|null;status:string;ts:string }>>([]);
  const [aiSignal, setAiSignal]               = useState<AiSignal|null>(null);
  const [openContracts, setOpenContracts]     = useState<Array<{cid:number;price:number}>>([]);

  const groupSymbols = useMemo(()=>TRACKED_SYMBOLS.filter((s)=>s.group===activeGroup),[activeGroup]);
  const statsMap = useMultiSymbolFeed(TRACKED_SYMBOLS, activeGroup);
  const groupStats = useMemo(()=>{
    const r:SymbolStat[]=[];
    groupSymbols.forEach((s)=>{
      const st=statsMap.get(s.key);
      r.push(st ?? { key:s.key,label:s.label,group:s.group,price:0,digit:0,digitFreq:Array(10).fill(0),tickCount:0,lastUpdate:0 });
    });
    return r;
  },[groupSymbols,statsMap]);

  const selectedStat = statsMap.get(symbol) ?? groupStats[0];
  const derivWS = useDerivWS(null);

  // AI signal fetch
  useEffect(()=>{
    const fetch_=()=>fetch(`/api/ai-signals?symbol=${encodeURIComponent(symbol)}`)
      .then((r)=>r.json()).then((d:Record<string,unknown>)=>{
        const sigs=(d.signals as Array<AiSignal&{reasoning?:string}>|undefined)??[];
        if (sigs.length) { const best=sigs.sort((a,b)=>b.confidence-a.confidence)[0]; setAiSignal({...best,reason:best.reason??best.reasoning??""}); }
      }).catch(()=>{});
    fetch_();
    const t=setInterval(fetch_,7000);
    return ()=>clearInterval(t);
  },[symbol]);

  // Auto-trade trigger
  useEffect(()=>{
    if (!autoTrade||derivWS.status!=="connected"||trading) return;
    const delay=1500+Math.random()*2000;
    const t=setTimeout(()=>{ void executeTrade(); },delay);
    return ()=>clearTimeout(t);
  },[autoTrade,derivWS.status,trading]);

  const currentStake = martingaleOn ? Math.min(stake*Math.pow(martMult,lossStreak),stake*32) : stake;

  const connectDeriv=()=>{
    const t=tokenInput.trim();
    if (!t) return;
    localStorage.setItem("deriv_token",t);
    derivWS.connect(t);
  };

  const executeTrade=async()=>{
    if (derivWS.status!=="connected"||trading) return;
    setTrading(true);
    const tradeId=Date.now().toString();
    setTrades((p)=>[{id:tradeId,type:contractType,stake:currentStake,profit:null,status:"pending",ts:new Date().toISOString()},...p.slice(0,19)]);
    try {
      const proposal:Record<string,unknown>={
        proposal:1,amount:currentStake,basis:"stake",contract_type:contractType,
        currency:derivWS.account?.currency??"USD",duration:ticks,duration_unit:"t",symbol,
      };
      if (contractType==="DIGITOVER"||contractType==="DIGITUNDER") proposal.barrier=barrier;
      if (contractType==="DIGITMATCH"||contractType==="DIGITDIFF") proposal.barrier=String(targetDigit);
      const propResp=await derivWS.request(proposal);
      const prop=propResp.proposal as Record<string,unknown>;
      const buyResp=await derivWS.request({ buy:prop.id as string,price:currentStake });
      const buy=buyResp.buy as Record<string,unknown>;
      const cid=buy.contract_id as number;
      const buyPrice=buy.buy_price as number;
      setOpenContracts((p)=>[...p,{cid,price:buyPrice}]);
      setTrades((p)=>p.map((t)=>t.id===tradeId?{...t,status:"open"}:t));
      setTimeout(async()=>{
        try {
          const poc=await derivWS.request({ proposal_open_contract:1,contract_id:cid });
          const c=poc.proposal_open_contract as Record<string,unknown>;
          const profit=(c.profit as number)??(((c.sell_price as number)??0)-buyPrice);
          const won=profit>0;
          setTrades((p)=>p.map((t)=>t.id===tradeId?{...t,status:won?"won":"lost",profit}:t));
          setSessionPL((prev)=>prev+profit);
          setOpenContracts((p)=>p.filter((x)=>x.cid!==cid));
          if(martingaleOn){ if(won) setLossStreak(0); else setLossStreak((ls)=>ls+1); }
        } catch { setOpenContracts((p)=>p.filter((x)=>x.cid!==cid)); }
      },(ticks+3)*1000);
    } catch(err){
      const msg=err instanceof Error?err.message:"failed";
      setTrades((p)=>p.map((t)=>t.id===tradeId?{...t,status:"lost",profit:-currentStake}:t));
      setSessionPL((prev)=>prev-currentStake);
      if(martingaleOn) setLossStreak((ls)=>ls+1);
      console.error("Trade:",msg);
    } finally { setTrading(false); }
  };

  const killAll=async()=>{
    setAutoTrade(false);
    for (const c of openContracts) { try { await derivWS.request({ sell:c.cid,price:0 }); } catch {} }
    setOpenContracts([]);
  };

  const statusColor={ disconnected:"#ef4444",connecting:"#fb8c00",authorizing:"#facc15",connected:"#22c55e" }[derivWS.status];
  const groupLabels:Record<string,string>={ Vol:"Volatility","1s":"Volatility 1s","C/B":"Crash / Boom",Jmp:"Jump" };
  const needsBarrier = contractType==="DIGITOVER"||contractType==="DIGITUNDER";
  const needsDigit   = contractType==="DIGITMATCH"||contractType==="DIGITDIFF";

  return (
    <div className="animate-fade-in-up" data-testid="page-deriv-trader">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <LineChart size={20} className="text-primary"/>
          <div>
            <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">DERIV TRADER</h2>
            <p className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Live Markets · Deriv.com Style · 1000-Tick Distribution</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {derivWS.status==="connected" && openContracts.length>0 && (
            <button onClick={killAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-orbitron text-xs font-black animate-pulse"
              style={{ background:"rgba(239,68,68,0.2)",border:"2px solid #ef4444",color:"#ef4444" }}>
              <X size={12}/> KILL ({openContracts.length})
            </button>
          )}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-bold"
            style={{ background:`${statusColor}18`,border:`1px solid ${statusColor}60`,color:statusColor }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background:statusColor }}/>
            {statsMap.size} live
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">

        {/* ── LEFT: Market view ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Floating digit circles for selected symbol — Deriv.com style */}
          {selectedStat && selectedStat.tickCount > 0 && (
            <div className="cyber-card p-4" style={{ border:"1px solid rgba(0,229,255,0.2)" }}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">{selectedStat.label}</div>
                  <div className="font-orbitron text-xl font-bold text-foreground">
                    {selectedStat.price>100 ? selectedStat.price.toFixed(2) : selectedStat.price.toFixed(4)}
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center font-orbitron text-2xl font-black text-white"
                    style={{ background:DIGIT_COLORS[selectedStat.digit], boxShadow:`0 0 20px ${DIGIT_COLORS[selectedStat.digit]}90` }}>
                    {selectedStat.digit}
                  </div>
                  <div className="font-rajdhani text-[9px] text-muted-foreground mt-0.5">{selectedStat.tickCount} ticks</div>
                </div>
              </div>
              {/* Floating circles with pink cursor */}
              <FloatingDigitCircles
                digitFreq={selectedStat.digitFreq}
                tickCount={selectedStat.tickCount}
                currentDigit={selectedStat.digit}/>
              <div className="flex items-center justify-center gap-4 mt-2 text-[9px] font-rajdhani text-muted-foreground">
                <div className="flex items-center gap-1.5"><div style={{ width:8,height:8,borderRadius:"50%",background:"#22c55e" }}/> Highest</div>
                <div className="flex items-center gap-1.5"><div style={{ width:8,height:8,borderRadius:"50%",background:"#ef4444" }}/> Lowest</div>
                <div className="flex items-center gap-1.5"><svg width={8} height={6} viewBox="0 0 8 6"><polygon points="4,0 8,6 0,6" fill="#ff1e9e"/></svg> Current (pink cursor)</div>
              </div>
            </div>
          )}

          {/* AI Signal panel */}
          {aiSignal && (
            <div className="cyber-card p-3">
              <div className="flex items-center gap-2 mb-2">
                <Bot size={13} className="text-primary"/>
                <span className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-muted-foreground">AI Signal</span>
                <span className="ml-auto font-orbitron text-xs font-bold"
                  style={{ color:aiSignal.confidence>=80?"#22c55e":aiSignal.confidence>=65?"#facc15":"#ef4444" }}>
                  {aiSignal.confidence.toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="px-2.5 py-1 rounded font-orbitron text-xs font-bold"
                  style={{ background:"rgba(0,229,255,0.12)",border:"1px solid rgba(0,229,255,0.3)",color:"#00e5ff" }}>
                  {CONTRACT_LABELS[aiSignal.contract_type]??aiSignal.contract_type}
                </div>
                <div className="font-rajdhani text-xs text-muted-foreground flex-1 truncate">{aiSignal.reason}</div>
                <button onClick={()=>{ setContractType(aiSignal.contract_type); if(aiSignal.barrier!=null) setBarrier(aiSignal.barrier); if(aiSignal.digit!=null) setTargetDigit(aiSignal.digit); }}
                  className="px-2 py-1 rounded font-rajdhani text-xs font-bold flex-shrink-0"
                  style={{ background:"rgba(0,229,255,0.1)",border:"1px solid rgba(0,229,255,0.3)",color:"#00e5ff" }}>
                  Apply
                </button>
              </div>
            </div>
          )}

          {/* Group tabs */}
          <div className="flex gap-1 border-b" style={{ borderColor:"rgba(255,255,255,0.08)" }}>
            {GROUPS.map((g)=>(
              <button key={g} onClick={()=>setActiveGroup(g)}
                className="px-3 py-2 font-rajdhani text-sm font-bold transition-all"
                style={activeGroup===g ? { color:"#00e5ff",borderBottom:"2px solid #00e5ff" } : { color:"rgba(255,255,255,0.4)" }}>
                {groupLabels[g]}
              </button>
            ))}
          </div>

          {/* Symbol cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {groupStats.map((stat)=>(
              <SymbolCard key={stat.key} stat={stat} isSelected={stat.key===symbol} onClick={()=>setSymbol(stat.key)}/>
            ))}
          </div>
          {groupStats.every((s)=>s.tickCount===0) && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <RefreshCw size={26} className="animate-spin"/>
              <div className="font-rajdhani text-sm">Connecting to live feeds…</div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Trade panel ─────────────────────────────────────────── */}
        <div className="lg:w-80 flex-shrink-0 space-y-3">

          {/* API Connection */}
          <div className="cyber-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <Wifi size={12} className="text-primary"/>
              <span className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-muted-foreground">API Connection</span>
              {tokenInput.startsWith("pat_") && <span className="text-[9px] font-rajdhani" style={{ color:"#facc15" }}>Beta/PAT</span>}
            </div>
            <div className="flex gap-1.5">
              <input type="password" value={tokenInput} onChange={(e)=>setTokenInput(e.target.value)}
                onKeyDown={(e)=>e.key==="Enter"&&connectDeriv()}
                placeholder="API token or pat_..."
                className="flex-1 px-2 py-1.5 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary"/>
              {derivWS.status==="connected"
                ? <button onClick={derivWS.disconnect} className="px-2.5 py-1.5 rounded font-rajdhani text-xs font-bold" style={{ background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.4)",color:"#ef4444" }}><WifiOff size={11}/></button>
                : <button onClick={connectDeriv} disabled={!tokenInput.trim()||derivWS.status==="connecting"} className="px-2.5 py-1.5 rounded font-rajdhani text-xs font-bold disabled:opacity-50" style={{ background:"rgba(0,229,255,0.15)",border:"1px solid rgba(0,229,255,0.4)",color:"#00e5ff" }}><Wifi size={11}/></button>}
            </div>
            {derivWS.error && <div className="flex items-center gap-1 mt-1.5 text-[10px] font-rajdhani text-red-400"><AlertCircle size={10}/>{derivWS.error}</div>}
          </div>

          {/* Account info */}
          {derivWS.account && (
            <div className="cyber-card p-3 space-y-1">
              {[
                { label:"Account",    value:derivWS.account.loginid,           color:"#00e5ff" },
                { label:"Balance",    value:`${derivWS.account.currency} ${(derivWS.balance??0).toFixed(2)}`, color:"#22c55e" },
                { label:"Type",       value:derivWS.account.is_virtual?"DEMO":"REAL", color:derivWS.account.is_virtual?"#facc15":"#22c55e" },
                { label:"Session P/L",value:`${sessionPL>=0?"+":""}${sessionPL.toFixed(2)}`, color:sessionPL>=0?"#22c55e":"#ef4444" },
              ].map(({ label,value,color })=>(
                <div key={label} className="flex items-center justify-between py-0.5">
                  <span className="font-rajdhani text-[10px] text-muted-foreground">{label}</span>
                  <span className="font-orbitron text-xs font-bold" style={{ color }}>{value}</span>
                </div>
              ))}
              {/* Account switcher */}
              {derivWS.accountList.length > 1 && (
                <div className="pt-1 border-t border-border/50">
                  <div className="font-rajdhani text-[9px] text-muted-foreground mb-1">Switch:</div>
                  <div className="flex flex-wrap gap-1">
                    {derivWS.accountList.map((a)=>(
                      <button key={a.loginid}
                        onClick={()=>a.token && derivWS.connect(a.token)}
                        className="px-2 py-0.5 rounded font-rajdhani text-[9px] font-bold"
                        style={{ background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",color:"#aaa" }}>
                        {a.loginid} {a.currency}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Trade Type */}
          <div className="cyber-card p-3">
            <div className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-2">Trade Type</div>
            <div className="grid grid-cols-4 gap-1">
              {TRADE_TYPES.map(({ key,label,color })=>(
                <button key={key} onClick={()=>setContractType(key)}
                  className="py-1.5 rounded font-orbitron text-xs font-bold transition-all"
                  style={contractType===key
                    ? { background:`${color}25`,border:`1.5px solid ${color}`,color }
                    : { background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.10)",color:"rgba(255,255,255,0.4)" }}>
                  {label}
                </button>
              ))}
            </div>

            {needsBarrier && (
              <div className="mt-2">
                <div className="font-rajdhani text-[10px] text-muted-foreground mb-1">Barrier</div>
                <div className="flex gap-1 flex-wrap">
                  {[0,1,2,3,4,5,6,7,8,9].map((v)=>(
                    <button key={v} onClick={()=>setBarrier(v)}
                      className="w-7 h-7 rounded font-orbitron text-xs font-bold"
                      style={barrier===v ? { background:DIGIT_COLORS[v],color:"#fff" } : { background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",color:"#888" }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {needsDigit && (
              <div className="mt-2">
                <div className="font-rajdhani text-[10px] text-muted-foreground mb-1">Target Digit</div>
                <div className="flex gap-1 flex-wrap">
                  {[0,1,2,3,4,5,6,7,8,9].map((v)=>(
                    <button key={v} onClick={()=>setTargetDigit(v)}
                      className="w-7 h-7 rounded font-orbitron text-xs font-bold"
                      style={targetDigit===v ? { background:DIGIT_COLORS[v],color:"#fff" } : { background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",color:"#888" }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stake + Duration */}
          <div className="cyber-card p-3 space-y-3">
            <div>
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
                Stake {martingaleOn && lossStreak>0 && <span style={{ color:"#facc15" }}> · Martingale: {currentStake.toFixed(2)}</span>}
              </div>
              <div className="flex gap-1 flex-wrap">
                {[0.5,1,2,5,10].map((v)=>(
                  <button key={v} onClick={()=>setStake(v)}
                    className="px-2 py-1 rounded font-orbitron text-xs font-bold"
                    style={stake===v ? { background:"#00e5ff",color:"#050a0f" } : { background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",color:"#aaa" }}>
                    {v}
                  </button>
                ))}
                <input type="number" min={0.35} step={0.5} value={stake} onChange={(e)=>setStake(parseFloat(e.target.value)||1)}
                  className="w-16 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none text-center"/>
              </div>
            </div>
            <div>
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Ticks</div>
              <div className="flex gap-1">
                {[1,2,3,5,10].map((v)=>(
                  <button key={v} onClick={()=>setTicks(v)}
                    className="px-2 py-1 rounded font-orbitron text-xs font-bold"
                    style={ticks===v ? { background:"#00e5ff",color:"#050a0f" } : { background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",color:"#aaa" }}>
                    {v}T
                  </button>
                ))}
              </div>
            </div>

            {/* Settings toggle */}
            <button onClick={()=>setShowSettings((p)=>!p)}
              className="flex items-center gap-1.5 text-[10px] font-rajdhani font-bold text-muted-foreground hover:text-primary transition-colors">
              <Settings2 size={11}/> {showSettings?"Hide":"Show"} Martingale settings
              <ChevronDown size={11} className={showSettings?"rotate-180 transition-transform":"transition-transform"}/>
            </button>
            {showSettings && (
              <div className="pt-2 border-t border-border/50 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-4 rounded-full relative cursor-pointer" style={{ background:martingaleOn?"#22c55e":"rgba(255,255,255,0.15)" }}
                    onClick={()=>{ setMartingaleOn((p)=>!p); setLossStreak(0); }}>
                    <div className="w-3 h-3 rounded-full absolute top-0.5 transition-all" style={{ left:martingaleOn?"calc(100% - 14px)":"2px",background:"#fff" }}/>
                  </div>
                  <span className="font-rajdhani text-xs font-bold" style={{ color:martingaleOn?"#22c55e":"#888" }}>Martingale {martingaleOn?"ON":"OFF"}</span>
                </div>
                {martingaleOn && (
                  <div className="flex gap-1">
                    {[1.5,2,2.5,3].map((v)=>(
                      <button key={v} onClick={()=>setMartMult(v)}
                        className="px-2 py-1 rounded font-orbitron text-xs font-bold"
                        style={martMult===v ? { background:"#facc15",color:"#050a0f" } : { background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",color:"#aaa" }}>
                        {v}×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Execute buttons */}
          <div className="space-y-2">
            <button onClick={()=>void executeTrade()}
              disabled={derivWS.status!=="connected"||trading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-orbitron text-sm font-black tracking-wider transition-all disabled:opacity-40"
              style={{ background:"#00e5ff",color:"#050a0f",boxShadow:"0 0 20px rgba(0,229,255,0.3)" }}>
              <Play size={14}/> {trading?"Executing…":"Execute Trade"}
            </button>
            <button onClick={()=>setAutoTrade((p)=>!p)}
              disabled={derivWS.status!=="connected"}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
              style={autoTrade
                ? { background:"rgba(239,68,68,0.2)",border:"2px solid #ef4444",color:"#ef4444" }
                : { background:"rgba(34,197,94,0.12)",border:"1px solid rgba(34,197,94,0.4)",color:"#22c55e" }}>
              {autoTrade ? <><Square size={13}/> Stop Auto</> : <><Bot size={13}/> Auto Trade</>}
            </button>
          </div>

          {autoTrade && <div className="flex items-center gap-2 text-xs font-rajdhani" style={{ color:"#22c55e" }}>
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>Auto-trading active
          </div>}

          {/* Mini trade history */}
          {trades.length > 0 && (
            <div className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-2">
                Trades · P/L: <span style={{ color:sessionPL>=0?"#22c55e":"#ef4444" }}>{sessionPL>=0?"+":""}{sessionPL.toFixed(2)}</span>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {trades.map((t)=>(
                  <div key={t.id} className="flex items-center justify-between py-1 px-2 rounded"
                    style={{ background:t.status==="won"?"rgba(34,197,94,0.08)":t.status==="lost"?"rgba(239,68,68,0.08)":"rgba(255,255,255,0.03)" }}>
                    <span className="font-orbitron text-[10px] font-bold" style={{ color:t.status==="won"?"#22c55e":t.status==="lost"?"#ef4444":"#888" }}>
                      {CONTRACT_LABELS[t.type]??t.type}
                    </span>
                    <span className="font-orbitron text-[10px] font-bold" style={{ color:t.profit!=null?(t.profit>=0?"#22c55e":"#ef4444"):"#888" }}>
                      {t.profit!=null?`${t.profit>=0?"+":""}${t.profit.toFixed(2)}`:t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Market summary bar */}
      {groupStats.some((s)=>s.tickCount>0) && (
        <div className="cyber-card p-3 mt-4">
          <div className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-2">Market Summary</div>
          <div className="flex flex-wrap gap-2">
            {groupStats.filter((s)=>s.tickCount>0).map((s)=>(
              <button key={s.key} onClick={()=>setSymbol(s.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-rajdhani text-xs font-semibold transition-all"
                style={s.key===symbol
                  ? { background:"rgba(0,229,255,0.15)",border:"1px solid rgba(0,229,255,0.4)",color:"#00e5ff" }
                  : { background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.6)" }}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center font-orbitron text-[9px] font-black text-white" style={{ background:DIGIT_COLORS[s.digit] }}>{s.digit}</div>
                {s.label.split(" ").slice(-1)[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3">
        <TrendingUp size={11} className="text-green-400"/>
        <TrendingDown size={11} className="text-red-400"/>
        <User size={11} className="text-muted-foreground"/>
        <span className="font-rajdhani text-[10px] text-muted-foreground">All data real-time from Deriv WebSocket · Pink cursor = current digit · 1000-tick window</span>
      </div>
    </div>
  );
}
