const RESEND_FROM_EMAIL = 'cre-copilot <onboarding@resend.dev>'

interface DemoRequest {
  name: string
  email: string
  firm: string
  note: string
}

export async function sendDemoRequestEmail(data: DemoRequest): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: process.env.DEMO_REQUEST_NOTIFY_EMAIL,
      subject: `Demo request from ${data.name}`,
      text: `Name: ${data.name}\nEmail: ${data.email}\nFirm: ${data.firm}\n\n${data.note}`,
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend request failed: ${response.status} ${await response.text()}`)
  }
}
