// Decorative side panels flanking the booth's center screen (docs/goal-ui.md
// PanelLeft/PanelRight) — purely visual chrome, no interactive state. Sized
// smaller than the reference (200x460 vs. 250x600) so the whole triptych
// fits comfortably inside a page layout alongside real page content instead
// of owning the full viewport the way the standalone reference mock does.

export function BoothPanelLeft({ instructions }: { instructions: string[] }) {
  return (
    <div className="hidden w-[170px] h-[460px] bg-panel border-booth border-structural-gray rounded-booth flex-col items-center py-8 px-4 relative shadow-booth lg:flex">
      <div className="w-full h-[44px] border-booth-inner border-structural-gray mb-8 flex items-center justify-center overflow-hidden">
        <div className="w-[80%] h-[3px] bg-current opacity-30 rotate-[-45deg] text-ink" />
      </div>

      <div className="flex flex-col gap-4 w-full mb-auto">
        {instructions.map((text, i) => (
          <div key={i} className="flex items-center gap-2.5 p-2.5 border-booth-inner border-structural-gray rounded-booth">
            <span className="text-[16px] font-bold text-ink font-display">{i + 1}</span>
            <span className="text-[11px] leading-tight text-ink font-sans">{text}</span>
          </div>
        ))}
      </div>

      <div className="w-[50px] h-[110px] flex flex-col items-center">
        <div className="w-[40px] h-[40px] border-booth-inner border-structural-gray rounded-full mb-2.5 flex justify-center items-center relative">
          <div className="w-[13px] h-[13px] border-booth-inner border-structural-gray rounded-full" />
        </div>
        <div className="w-[32px] h-[64px] border-booth-inner border-structural-gray rounded-booth flex justify-center py-2.5">
          <div className="w-[5px] h-full bg-current text-ink opacity-50 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function BoothPanelRight({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <div className="hidden w-[170px] h-[460px] bg-panel border-booth border-structural-gray rounded-booth flex-col items-center justify-end py-8 relative overflow-hidden shadow-booth lg:flex">
      <div className="absolute top-8 w-[80%] p-3 text-center border-booth-inner border-structural-gray rounded-booth">
        <span className="text-[13px] font-bold block mb-1.5 text-ink font-sans">{label}</span>
        <span className="text-[10px] opacity-70 text-ink font-sans">{sublabel}</span>
      </div>

      <div className="w-[100px] h-[200px] border-booth-inner border-structural-gray rounded-booth relative flex justify-center p-4">
        <div className="w-full h-full border-booth-inner border-structural-gray bg-black/10 relative flex justify-center">
          <div className="absolute top-0 bottom-0 left-1/2 -ml-[1px] w-[2px] bg-current text-ink opacity-20" />
          <div className="w-[56px] h-[28px] bg-screen absolute top-3 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
