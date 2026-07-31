"use client";

export interface OutputActionsProps {
  stripUrl: string;
}

// Real download / native-share / print wiring lands in Step 4 Item 8.
export default function OutputActions({ stripUrl }: OutputActionsProps) {
  void stripUrl;
  return (
    <div>
      <button disabled>Download</button>
      <button disabled>Share</button>
      <button disabled>Print</button>
    </div>
  );
}
