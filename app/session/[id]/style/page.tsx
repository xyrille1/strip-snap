import StyleClient from "./StyleClient";

interface StylePageProps {
  params: { id: string };
}

// Server shell only — real preset picker + Canvas preview (Step 4 Item 7)
// lives in StyleClient.
export default function StylePage({ params }: StylePageProps) {
  return <StyleClient sessionId={params.id} />;
}
