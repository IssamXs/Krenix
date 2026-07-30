import { redirect } from 'next/navigation'

// /v2 was the staging ground for the current homepage design — it has since
// become the real "/" (see src/app/page.tsx, which now owns this page's old
// implementation). Kept as a redirect only for anyone with an old /v2 link.
export default function V2Redirect() {
  redirect('/')
}
