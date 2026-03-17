export async function sendFeedback(message: string, context: string): Promise<void> {
  try {
    await fetch('/api/feedback', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message, context }),
    });
  } catch {
    // Fail silently — feedback errors should never break the UX
  }
}
