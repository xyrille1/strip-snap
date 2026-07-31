import CaptureClient from "./CaptureClient";

interface CapturePageProps {
  params: { id: string };
}

// Server shell only — real countdown/camera logic (Step 4 Item 5) lives in
// CaptureClient, which needs the browser (getUserMedia, Canvas).
export default function CapturePage({ params }: CapturePageProps) {
  return <CaptureClient sessionId={params.id} />;
}
