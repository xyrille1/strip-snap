import React, { useState, useRef, useEffect } from 'react';

const THEMES = {
classic: {
id: 'classic',
name: 'Classic Sketch',
appBg: '#F5F6F8',
panelBg: '#FFFFFF',
screenBg: '#111111',
border: 'border-[4px] border-black',
borderInner: 'border-[2px] border-black',
text: 'text-black',
accent: '#000000',
shadow: 'shadow-[8px_8px_0_0_rgba(0,0,0,1)]',
rounded: 'rounded-none',
font: 'system-ui, -apple-system, sans-serif',
handwriting: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive',
glow: 'none',
},
neon: {
id: 'neon',
name: 'Neon Cyberpunk',
appBg: '#050505',
panelBg: '#1a1a24',
screenBg: '#000000',
border: 'border-[2px] border-cyan-400',
borderInner: 'border-[1px] border-pink-500',
text: 'text-cyan-300',
accent: '#ec4899', // pink-500
shadow: 'shadow-[0_0_20px_rgba(34,211,238,0.4)]',
rounded: 'rounded-[8px]',
font: '"Courier New", Courier, monospace',
handwriting: '"Courier New", Courier, monospace',
glow: 'drop-shadow(0 0 8px rgba(236,72,153,0.8))',
},
kawaii: {
id: 'kawaii',
name: 'Kawaii Pastel',
appBg: '#fdf2f8', // pink-50
panelBg: '#ffffff',
screenBg: '#fce7f3', // pink-200
border: 'border-[4px] border-pink-300',
borderInner: 'border-[3px] border-purple-300',
text: 'text-purple-600',
accent: '#d8b4fe', // purple-300
shadow: 'shadow-[0_10px_25px_rgba(244,114,182,0.3)]',
rounded: 'rounded-[32px]',
font: '"Quicksand", "Nunito", sans-serif',
handwriting: '"Quicksand", "Nunito", sans-serif',
glow: 'none',
}
};

const FRAME_COLORS = ['#FFFFFF', '#111111', '#FFB6C1', '#AEC6CF', '#FDFD96'];

const CameraIcon = () => (
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
<circle cx="12" cy="13" r="3" />
</svg>
);

const UsersIcon = () => (
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
<circle cx="9" cy="7" r="4"></circle>
<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
</svg>
);

const UserIcon = () => (
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
<circle cx="12" cy="7" r="4"></circle>
</svg>
);

const DownloadIcon = () => (
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
<polyline points="7 10 12 15 17 10" />
<line x1="12" y1="15" x2="12" y2="3" />
</svg>
);

const LinkIcon = () => (
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
</svg>
);

const ThemeSelector = ({ currentTheme, onSelect }) => (

  <div className="flex gap-[16px] mb-[32px]">
    {Object.values(THEMES).map(t => (
      <button
        key={t.id}
        onClick={() => onSelect(t.id)}
        className={`px-[24px] py-[12px] text-[14px] font-bold transition-all duration-300 ${t.id === currentTheme ? t.border + ' ' + t.shadow + ' scale-105' : 'border-[2px] border-gray-400 opacity-60'}`}
        style={{ backgroundColor: t.panelBg, color: t.text, fontFamily: t.font, borderRadius: t.rounded !== 'rounded-none' ? '12px' : '0' }}
      >
        {t.name}
      </button>
    ))}
  </div>
);

const SetupOverlay = ({ th, onStartSolo, onStartMulti }) => (

  <div className="absolute inset-0 z-50 flex flex-col items-center justify-start pt-[10vh] bg-black/40 backdrop-blur-sm pointer-events-auto">
    <div 
      className={`flex flex-col items-center p-[48px] ${th.panelBg === '#FFFFFF' ? 'bg-white' : th.panelBg} ${th.border} ${th.shadow} ${th.rounded} w-[600px] max-w-full`}
    >
      <h1 className={`text-[48px] font-bold mb-[8px] text-center uppercase tracking-widest ${th.text}`} style={{ fontFamily: th.font, filter: th.glow }}>
        3D PHOTOBOOTH
      </h1>
      <p className={`text-[16px] mb-[40px] opacity-80 ${th.text}`} style={{ fontFamily: th.handwriting }}>
        Select your vibe & mode to enter the booth.
      </p>

      <div className="flex gap-[24px] w-full">
        <button
          onClick={onStartSolo}
          className={`flex-1 flex flex-col items-center justify-center py-[32px] gap-[12px] hover:scale-105 transition-transform ${th.borderInner} ${th.rounded} cursor-pointer`}
          style={{ color: th.text }}
        >
          <UserIcon />
          <span className="font-bold text-[18px]" style={{ fontFamily: th.font }}>Solo Session</span>
        </button>
        <button
          onClick={onStartMulti}
          className={`flex-1 flex flex-col items-center justify-center py-[32px] gap-[12px] hover:scale-105 transition-transform ${th.borderInner} ${th.rounded} cursor-pointer relative overflow-hidden`}
          style={{ color: th.text }}
        >
          <div className="absolute inset-0 opacity-10 bg-gradient-to-r from-purple-500 to-pink-500" />
          <UsersIcon />
          <span className="font-bold text-[18px] relative z-10" style={{ fontFamily: th.font }}>Invite Friend</span>
          <span className="text-[12px] opacity-70 relative z-10" style={{ fontFamily: th.handwriting }}>(Multiplayer)</span>
        </button>
      </div>
    </div>

  </div>
);

const InviteOverlay = ({ th, onSimulateJoin }) => {
const [copied, setCopied] = useState(false);
const link = "photobooth.app/join/x7y9-z2";

useEffect(() => {
// Auto-join simulation after 4 seconds
const timer = setTimeout(() => {
onSimulateJoin();
}, 4000);
return () => clearTimeout(timer);
}, [onSimulateJoin]);

const handleCopy = () => {
navigator.clipboard.writeText(link);
setCopied(true);
};

return (
<div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md pointer-events-auto">
<div className={`flex flex-col items-center p-[48px] ${th.panelBg === '#FFFFFF' ? 'bg-white' : th.panelBg} ${th.border} ${th.shadow} ${th.rounded} w-[500px] text-center`}>
<div className="animate-spin mb-[24px]" style={{ color: th.accent }}><UsersIcon /></div>
<h2 className={`text-[24px] font-bold mb-[16px] ${th.text}`} style={{ fontFamily: th.font }}>Waiting for friend...</h2>
<p className={`text-[14px] mb-[24px] opacity-80 ${th.text}`} style={{ fontFamily: th.handwriting }}>
Share this link with your friend to join the session. They will appear on the right side of the camera!
</p>

        <div className={`flex items-center w-full ${th.borderInner} ${th.rounded} overflow-hidden mb-[16px]`}>
          <div className={`flex-1 py-[12px] px-[16px] text-left text-[14px] opacity-70 bg-black/10 ${th.text}`} style={{ fontFamily: th.font }}>
            {link}
          </div>
          <button
            onClick={handleCopy}
            className={`py-[12px] px-[24px] font-bold hover:brightness-110 flex items-center gap-[8px] transition-colors`}
            style={{ backgroundColor: th.accent, color: th.panelBg, fontFamily: th.font }}
          >
            <LinkIcon /> {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className={`text-[12px] opacity-60 ${th.text}`} style={{ fontFamily: th.font }}>
          (Simulating connection in a few seconds...)
        </p>
      </div>
    </div>

);
};

// The Left Panel (Coin Slot & Instructions)
const PanelLeft = ({ th }) => (

  <div className={`w-[250px] h-[600px] ${th.panelBg === '#FFFFFF' ? 'bg-white' : th.panelBg} ${th.border} ${th.rounded} flex flex-col items-center py-[40px] px-[20px] relative`}>
    {/* Decorative Top */}
    <div className={`w-full h-[60px] ${th.borderInner} mb-[40px] flex items-center justify-center overflow-hidden`}>
       <div className={`w-[80%] h-[4px] bg-current opacity-30 rotate-[-45deg] ${th.text}`} />
    </div>

    {/* Instructions */}
    <div className="flex flex-col gap-[20px] w-full mb-[60px]">
      {[
        "1. Choose Filter",
        "2. Pick Frame",
        "3. Pose & Smile!"
      ].map((text, i) => (
        <div key={i} className={`flex items-center gap-[12px] p-[12px] ${th.borderInner} ${th.rounded}`}>
          <span className={`text-[20px] font-bold ${th.text}`} style={{ fontFamily: th.font }}>{i+1}</span>
          <span className={`text-[12px] leading-tight ${th.text}`} style={{ fontFamily: th.handwriting }}>{text.substring(3)}</span>
        </div>
      ))}
    </div>

    {/* Coin Slot */}
    <div className="absolute bottom-[40px] w-[60px] h-[140px] flex flex-col items-center">
      <div className={`w-[48px] h-[48px] ${th.borderInner} rounded-full mb-[12px] flex justify-center items-center relative shadow-inner`}>
        <div className={`w-[16px] h-[16px] ${th.borderInner} rounded-full`} />
      </div>
      <div className={`w-[40px] h-[80px] ${th.borderInner} ${th.rounded} flex justify-center py-[12px]`}>
        <div className={`w-[6px] h-full ${th.text} bg-current opacity-50 rounded-full`} />
      </div>
    </div>

  </div>
);

// The Right Panel (Delivery Chute)
const PanelRight = ({ th }) => (

  <div className={`w-[250px] h-[600px] ${th.panelBg === '#FFFFFF' ? 'bg-white' : th.panelBg} ${th.border} ${th.rounded} flex flex-col items-center justify-end py-[40px] relative overflow-hidden`}>
    
    <div className={`absolute top-[40px] w-[80%] p-[16px] text-center ${th.borderInner} ${th.rounded}`}>
      <span className={`text-[16px] font-bold block mb-[8px] ${th.text}`} style={{ fontFamily: th.font }}>DELIVERY</span>
      <span className={`text-[12px] opacity-70 ${th.text}`} style={{ fontFamily: th.handwriting }}>Photos drop here</span>
    </div>

    {/* Dispenser Slot */}
    <div className={`w-[140px] h-[280px] ${th.borderInner} ${th.rounded} relative flex justify-center p-[20px] shadow-inner`}>
      <div className={`w-full h-full ${th.borderInner} bg-black/10 relative flex justify-center`}>
        <div className={`absolute top-0 bottom-0 left-[50%] ml-[-2px] w-[4px] ${th.text} opacity-20`} />
        {/* Dark Photo Strip Opening */}
        <div className="w-[80px] h-[40px] bg-[#050505] absolute top-[20px] shadow-inner rounded-sm" />
      </div>
    </div>

  </div>
);

const ScreenContent = ({
view, th, mode, filter, onToggleFilter, onNextFrame, onPrevFrame, frameColor,
onStartCapture, countdown, flash, videoRef1, videoRef2, camError
}) => {

const renderCameraFeeds = () => {
if (camError) {
return (
<div className={`absolute inset-0 flex items-center justify-center bg-gray-900 text-center p-4 z-0`}>
<p className="text-sm font-bold text-white" style={{ fontFamily: th.font }}>Camera access required.</p>
</div>
);
}

    const filterStyle = filter === 'bw' ? 'grayscale(100%)' : 'none';

    if (mode === 'multi') {
      return (
        <div className="absolute inset-0 flex z-0">
          {/* Player 1 */}
          <div className="flex-1 relative overflow-hidden border-r-[2px] border-black/50">
            <video ref={videoRef1} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)', filter: filterStyle }} />
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-[10px] text-white backdrop-blur-sm" style={{ fontFamily: th.font }}>YOU</div>
          </div>
          {/* Player 2 (Simulated with slight hue shift or flip) */}
          <div className="flex-1 relative overflow-hidden">
            <video ref={videoRef2} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(1)', filter: filterStyle + (filter === 'color' ? ' hue-rotate(15deg) contrast(1.1)' : '') }} />
            <div className="absolute bottom-2 right-2 bg-black/50 px-2 py-1 rounded text-[10px] text-white backdrop-blur-sm" style={{ fontFamily: th.font }}>FRIEND</div>
          </div>
        </div>
      );
    }

    return (
      <video ref={videoRef1} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover z-0" style={{ transform: 'scaleX(-1)', filter: filterStyle }} />
    );

};

return (
<div className={`w-[400px] h-[600px] ${th.panelBg === '#FFFFFF' ? 'bg-white' : th.panelBg} ${th.border} ${th.rounded} flex flex-col items-center p-[20px] relative z-10`}>

      {/* Top Light */}
      <div className={`w-[200px] h-[32px] ${th.borderInner} ${th.rounded} mb-[20px] flex items-center justify-center bg-white/5`}>
        <div className={`w-full h-full m-[2px] ${view === 'countdown' ? 'bg-red-500 animate-pulse' : (view === 'booth_action' || view === 'booth_frame' ? 'bg-green-400' : 'bg-gray-400 opacity-20')} transition-colors duration-300`} style={{ borderRadius: th.rounded === 'rounded-none' ? '0' : '4px' }} />
      </div>

      {/* Main Screen Bezel */}
      <div className={`w-full h-[400px] ${th.borderInner} rounded-[8px] p-[12px] bg-black mb-[20px] relative`}>
        <div className={`w-full h-full rounded-[4px] overflow-hidden relative flex flex-col items-center justify-center`} style={{ backgroundColor: th.screenBg }}>

          {renderCameraFeeds()}

          {/* Overlays based on view */}
          {view === 'booth_action' && (
            <div className="absolute inset-0 bg-black/40 z-10 flex flex-col items-center justify-center gap-[16px] backdrop-blur-sm">
               <button
                onClick={onStartCapture}
                className={`px-[32px] py-[16px] text-[16px] font-bold flex items-center gap-[12px] hover:scale-105 transition-transform shadow-lg`}
                style={{ backgroundColor: th.accent, color: th.panelBg, fontFamily: th.font, borderRadius: th.rounded !== 'rounded-none' ? '12px' : '0' }}
              >
                <CameraIcon /> START CAPTURE
              </button>
            </div>
          )}

          {view === 'booth_frame' && (
            <div className="absolute inset-0 z-10 flex items-center justify-between px-[16px] bg-black/10">
              <button onClick={onPrevFrame} className={`text-[40px] text-white hover:scale-125 transition-transform drop-shadow-md`} style={{ fontFamily: th.font }}>&lt;</button>
              <div className="w-[80px] flex flex-col border-[2px] border-white/50 transition-colors duration-300 shadow-[0_0_15px_rgba(0,0,0,0.5)]" style={{ backgroundColor: frameColor }}>
                <div className="h-[80px] border-b-[2px] border-black/20 bg-white/20" />
                <div className="h-[80px] border-b-[2px] border-black/20 bg-white/20" />
                <div className="h-[80px] border-b-[2px] border-black/20 bg-white/20" />
                <div className="h-[80px] bg-white/20" />
              </div>
              <button onClick={onNextFrame} className={`text-[40px] text-white hover:scale-125 transition-transform drop-shadow-md`} style={{ fontFamily: th.font }}>&gt;</button>
            </div>
          )}

          {view === 'countdown' && countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <span className="text-white text-[140px] font-bold drop-shadow-[0_0_20px_rgba(0,0,0,0.8)]" style={{ fontFamily: th.font, filter: th.glow }}>{countdown}</span>
            </div>
          )}

          {flash && (
            <div className="absolute inset-0 bg-white z-20 animate-ping" style={{ animationDuration: '0.2s' }} />
          )}

        </div>
      </div>

      {/* Control Deck (Filter & Buttons) */}
      <div className="w-full flex justify-between items-center px-[8px]">

        {/* Toggle Switch */}
        <div className="flex flex-col items-center gap-[4px]">
          <span className={`text-[12px] opacity-70 ${th.text}`} style={{ fontFamily: th.font }}>FILTER</span>
          <div className={`relative w-[60px] h-[28px] ${th.borderInner} rounded-full cursor-pointer flex items-center px-[2px] bg-black/5`} onClick={onToggleFilter}>
            <div className={`absolute w-[20px] h-[20px] rounded-full transition-all duration-300 ${filter === 'color' ? 'left-[34px]' : 'left-[4px]'}`} style={{ backgroundColor: th.text, filter: th.glow }} />
          </div>
          <div className="flex gap-[16px] mt-[4px]">
            <span className={`text-[10px] ${filter === 'bw' ? 'font-bold' : 'opacity-50'} ${th.text}`} style={{ fontFamily: th.handwriting }}>B&W</span>
            <span className={`text-[10px] ${filter === 'color' ? 'font-bold' : 'opacity-50'} ${th.text}`} style={{ fontFamily: th.handwriting }}>COLOR</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={view === 'booth_frame' ? onStartCapture : () => {}}
          className={`w-[80px] h-[80px] rounded-full ${th.borderInner} flex items-center justify-center ${view === 'booth_frame' ? 'cursor-pointer hover:scale-105 active:scale-95' : 'opacity-50'} transition-all`}
          style={{ backgroundColor: view === 'booth_frame' ? th.accent : 'transparent', boxShadow: view === 'booth_frame' ? `0 0 15px ${th.accent}` : 'none' }}
        >
          {view === 'booth_frame' ? <CameraIcon color={th.panelBg} /> : <div className={`w-[40px] h-[40px] rounded-full border-[2px] border-current opacity-30 ${th.text}`} />}
        </button>

      </div>
    </div>

);
};

const Photostrip = ({ photos, frameColor, th, scale = 1, rotation = 0 }) => {
return (
<div
className={`w-[160px] flex flex-col transition-all duration-700 p-[10px] gap-[10px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50`}
style={{
        transform: `scale(${scale}) rotate(${rotation}deg)`,
        backgroundColor: frameColor,
        border: `2px solid ${th.id === 'classic' ? '#000' : 'rgba(255,255,255,0.2)'}`
      }} >
{photos && photos.length === 4 ? (
photos.map((src, i) => (
<img key={i} src={src} className="w-full h-[105px] object-cover border-[1px] border-black/50 bg-black" alt={`shot ${i+1}`} />
))
) : (
[1,2,3,4].map(i => <div key={i} className="w-full h-[105px] border-[1px] border-black/50 bg-[#222]" />)
)}
<div className="h-[24px] flex items-center justify-center opacity-60">
<span className="text-[10px] font-bold" style={{ color: th.id === 'classic' ? '#000' : '#fff', fontFamily: th.handwriting }}>
PHOTOMAT // 2026
</span>
</div>
</div>
);
};

export default function App() {
// State
const [themeId, setThemeId] = useState('classic');
const [view, setView] = useState('setup'); // setup, invite, booth_action, booth_frame, countdown, delivery, result
const [mode, setMode] = useState('solo'); // solo, multi

const [stream, setStream] = useState(null);
const [camError, setCamError] = useState(false);
const [filter, setFilter] = useState('color');
const [frameIndex, setFrameIndex] = useState(0);
const [capturedPhotos, setCapturedPhotos] = useState([]);
const [countdown, setCountdown] = useState(null);
const [flash, setFlash] = useState(false);
const [stripRotation, setStripRotation] = useState(-5);

// Refs
const videoRef1 = useRef(null);
const videoRef2 = useRef(null);
const canvasRef = useRef(null);

const th = THEMES[themeId];
const frameColor = FRAME_COLORS[frameIndex];

// Camera Management
const startCamera = async () => {
try {
const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
setStream(mediaStream);
setCamError(false);
} catch (err) {
console.error("Camera access denied or failed", err);
setCamError(true);
}
};

const stopCamera = () => {
if (stream) {
stream.getTracks().forEach(track => track.stop());
setStream(null);
}
};

// Sync stream to video elements
useEffect(() => {
if (stream) {
if (videoRef1.current) videoRef1.current.srcObject = stream;
if (videoRef2.current) videoRef2.current.srcObject = stream;
}
}, [stream, view, mode]);

useEffect(() => {
return () => stopCamera();
}, []);

// Actions
const handleStartSolo = () => {
setMode('solo');
startCamera();
setView('booth_action');
};

const handleStartMulti = () => {
setMode('multi');
setView('invite');
};

const handleSimulateJoin = () => {
startCamera();
setView('booth_action');
};

const toggleFilter = () => setFilter(prev => prev === 'color' ? 'bw' : 'color');
const nextFrame = () => setFrameIndex(prev => (prev + 1) % FRAME_COLORS.length);
const prevFrame = () => setFrameIndex(prev => (prev - 1 + FRAME_COLORS.length) % FRAME_COLORS.length);

// 3D CSS Transform Logic based on View
const getBoothTransform = () => {
switch(view) {
case 'setup':
case 'invite':
return 'rotateX(-10deg) rotateY(-25deg) scale(0.85) translateZ(-100px)';
case 'booth_action':
case 'booth_frame':
case 'countdown':
return 'rotateX(0deg) rotateY(0deg) scale(1) translateZ(50px)';
case 'delivery':
// Tilt up and turn slightly right to look at delivery chute
return 'rotateX(15deg) rotateY(-10deg) scale(0.9) translateZ(0px)';
case 'result':
// Push back into shadow
return 'rotateX(5deg) rotateY(0deg) scale(0.7) translateZ(-400px) translateY(-50px)';
default:
return 'rotateX(0deg) rotateY(0deg) scale(1)';
}
};

const startCaptureSequence = async () => {
setView('countdown');
const newPhotos = [];

    for (let i = 0; i < 4; i++) {
      for (let c = 3; c > 0; c--) {
        setCountdown(c);
        await new Promise(r => setTimeout(r, 1000));
      }
      setCountdown(null);
      setFlash(true);

      // Capture logic
      if (videoRef1.current && canvasRef.current) {
        const video = videoRef1.current;
        const canvas = canvasRef.current;

        if (mode === 'solo') {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          if (filter === 'bw') ctx.filter = 'grayscale(100%)';
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } else {
          // Multi - composite both feeds side by side
          canvas.width = video.videoWidth * 2;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');

          if (filter === 'bw') ctx.filter = 'grayscale(100%)';

          // Draw P1 (Mirrored)
          ctx.save();
          ctx.translate(video.videoWidth, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
          ctx.restore();

          // Draw P2 (Simulated friend - normal orientation, slightly different hue)
          ctx.save();
          if (filter === 'color') ctx.filter = 'hue-rotate(15deg) contrast(1.1)';
          ctx.drawImage(video, video.videoWidth, 0, video.videoWidth, video.videoHeight);
          ctx.restore();
        }

        newPhotos.push(canvas.toDataURL('image/png'));
        setCapturedPhotos([...newPhotos]);
      }

      await new Promise(r => setTimeout(r, 150));
      setFlash(false);
      await new Promise(r => setTimeout(r, 850));
    }

    stopCamera();
    setView('delivery');

    // Simulate printing delay then show result
    setTimeout(() => {
      setView('result');
    }, 2500);

};

const handleRestart = () => {
setCapturedPhotos([]);
setView('setup');
};

const handleDownload = async () => {
if (capturedPhotos.length === 0) return;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

    const photoW = mode === 'multi' ? 800 : 400;
    const photoH = mode === 'multi' ? 300 : 300; // Keep aspect ratio wide for multi
    const padding = 30;
    const bottomPadding = 120;

    canvas.width = photoW + (padding * 2);
    canvas.height = (photoH * 4) + (padding * 5) + bottomPadding;

    ctx.fillStyle = frameColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < capturedPhotos.length; i++) {
      await new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          ctx.fillStyle = '#000000';
          ctx.fillRect(padding - 4, padding + (i * (photoH + padding)) - 4, photoW + 8, photoH + 8);
          ctx.drawImage(img, padding, padding + (i * (photoH + padding)), photoW, photoH);
          resolve();
        };
        img.src = capturedPhotos[i];
      });
    }

    // Add Logo text
    ctx.fillStyle = th.id === 'classic' ? '#000000' : '#ffffff';
    ctx.font = `bold 24px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("PHOTOMAT // 2026", canvas.width / 2, canvas.height - 40);

    const link = document.createElement('a');
    link.download = `photostrip-${themeId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

};

return (
<div
className="w-full h-screen overflow-hidden relative flex flex-col items-center justify-start transition-colors duration-1000"
style={{ backgroundColor: th.appBg, perspective: '1200px' }} >
{/_ Dynamic Background Elements _/}
<div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
{th.id === 'classic' && (
<div className="w-[150vw] h-[150vh] opacity-5" style={{ backgroundImage: 'radial-gradient(circle at center, #000 2px, transparent 2px)', backgroundSize: '24px 24px' }} />
)}
{th.id === 'neon' && (
<div className="w-full h-full relative">
<div className="absolute bottom-0 w-full h-[50vh] bg-gradient-to-t from-pink-900/20 to-transparent" />
<div className="absolute top-0 w-full h-[50vh] bg-gradient-to-b from-cyan-900/20 to-transparent" />
</div>
)}
{th.id === 'kawaii' && (
<div className="absolute w-[800px] h-[800px] bg-white/40 rounded-full blur-3xl opacity-60 top-[-200px] left-[-200px]" />
)}
</div>

      {/* Overlays */}
      <div className="absolute top-[40px] z-50 w-full flex justify-center pointer-events-auto">
        {view === 'setup' && (
          <div className="flex flex-col items-center">
            <ThemeSelector currentTheme={themeId} onSelect={setThemeId} />
          </div>
        )}
      </div>

      {view === 'setup' && <SetupOverlay th={th} onStartSolo={handleStartSolo} onStartMulti={handleStartMulti} />}
      {view === 'invite' && <InviteOverlay th={th} onSimulateJoin={handleSimulateJoin} />}

      {/* 3D Triptych Booth Container */}
      <div
        className="w-full h-full flex justify-center items-center absolute inset-0 z-10"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* The Booth Assembly */}
        <div
          className="flex items-center transition-all duration-[1200ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
          style={{
            transformStyle: 'preserve-3d',
            transform: getBoothTransform()
          }}
        >
          {/* Left Wing */}
          <div
            style={{ transform: 'rotateY(35deg)', transformOrigin: 'right center' }}
            className="transition-all duration-1000"
          >
            <PanelLeft th={th} />
          </div>

          {/* Center Screen Unit */}
          <div
            style={{ transform: 'translateZ(20px)' }}
            className="transition-all duration-1000 mx-[2px]"
          >
            <ScreenContent
              view={view} th={th} mode={mode} filter={filter}
              onToggleFilter={toggleFilter} onNextFrame={nextFrame} onPrevFrame={prevFrame}
              frameColor={frameColor} onStartCapture={view === 'booth_action' ? () => setView('booth_frame') : startCaptureSequence}
              countdown={countdown} flash={flash} videoRef1={videoRef1} videoRef2={videoRef2} camError={camError}
            />
          </div>

          {/* Right Wing */}
          <div
            style={{ transform: 'rotateY(-35deg)', transformOrigin: 'left center' }}
            className="transition-all duration-1000"
          >
            <PanelRight th={th} />
          </div>

          {/* Floor Shadow */}
          <div
            className="absolute bottom-[-100px] left-[-200px] right-[-200px] h-[300px] rounded-[50%] blur-3xl opacity-30 pointer-events-none transition-opacity duration-1000"
            style={{
              transform: 'rotateX(90deg) translateZ(-250px)',
              background: th.id === 'neon' ? 'radial-gradient(circle, rgba(236,72,153,0.4) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(0,0,0,0.8) 0%, transparent 70%)',
              opacity: view === 'result' ? 0.1 : 0.4
            }}
          />
        </div>
      </div>

      {/* Result Floating Strip */}
      {view === 'result' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto overflow-y-auto pt-[40px] pb-[100px]">

          <div
            className="cursor-pointer transition-transform hover:scale-105 duration-300 mb-[40px]"
            onClick={() => setStripRotation(prev => prev === -5 ? 5 : -5)}
          >
            <Photostrip photos={capturedPhotos} frameColor={frameColor} th={th} scale={1.2} rotation={stripRotation} />
          </div>

          <div className="flex gap-[16px]">
            <button
              onClick={handleDownload}
              className={`px-[24px] py-[12px] font-bold flex items-center gap-[8px] hover:scale-105 transition-transform ${th.rounded}`}
              style={{ backgroundColor: th.panelBg, color: th.text, border: `2px solid ${th.text}`, fontFamily: th.font }}
            >
              <DownloadIcon /> Download Strip
            </button>
            <button
              onClick={handleRestart}
              className={`px-[24px] py-[12px] font-bold flex items-center gap-[8px] hover:scale-105 transition-transform ${th.rounded}`}
              style={{ backgroundColor: th.accent, color: th.panelBg, fontFamily: th.font }}
            >
              New Session
            </button>
          </div>
        </div>
      )}

      {/* Hidden Canvas for capture processing */}
      <canvas ref={canvasRef} className="hidden" />

    </div>

);
}
