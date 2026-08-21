import { submitOnboarding } from '../../onboarding/actions'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const result = await submitOnboarding(formData)
    return Response.json({ result })
  } catch (err: unknown) {
    console.error('API Error:', err)
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    return Response.json({ error: message, stack }, { status: 500 })
  }
}
