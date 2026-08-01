interface StripPageProps {
  params: { id: string };
}

// Standalone public share view — no auth/join required. Real content
// (GET /api/strips/:id, download/print actions) lands in Step 4 Item 8.
export default function StripPage({ params }: StripPageProps) {
  return (
    <main>
      <h1>Strip {params.id}</h1>
      <p>Public share view placeholder.</p>
    </main>
  );
}
