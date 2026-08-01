import GenerateClient from "./GenerateClient";

interface GeneratePageProps {
  params: { id: string };
}

// Server shell only — real login-gate + generation logic (Step 4 Item 8)
// lives in GenerateClient.
export default function GeneratePage({ params }: GeneratePageProps) {
  return <GenerateClient sessionId={params.id} />;
}
