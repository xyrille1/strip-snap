export interface SessionExpiredProps {
  sessionId: string;
}

// Real expired-session messaging + redirect lands in Step 4 Item 10.
export default function SessionExpired({ sessionId }: SessionExpiredProps) {
  return <div>Session {sessionId} has expired.</div>;
}
