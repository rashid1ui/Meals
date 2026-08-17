import { submitOnboarding } from '../../onboarding/actions'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const result = await submitOnboarding(formData)
    return Response.json({ result })
  } catch (err: any) {
    console.error('API Error:', err)
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 })
  }
}
