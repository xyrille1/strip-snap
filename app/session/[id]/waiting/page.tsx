interface WaitingPageProps {
  params: { id: string };
}

// Invite link + live presence list (Supabase Realtime) lands in Step 4 Item 4.
export default function WaitingPage({ params }: WaitingPageProps) {
  return (
    <main>
      <h1>Waiting room — session {params.id}</h1>
      <p>Invite link and live presence list placeholder.</p>
    </main>
  );
}
