interface OutputPageProps {
  params: { id: string };
}

// In-session finished-strip hero + download/share/print lands in Step 4 Item 8.
export default function OutputPage({ params }: OutputPageProps) {
  return (
    <main>
      <h1>Your strip — session {params.id}</h1>
      <p>Finished strip hero and download/share/print actions placeholder.</p>
    </main>
  );
}
