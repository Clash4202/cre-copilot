// The app's prompt-injection defense, in exactly one place on purpose.
//
// Every prompt this app builds wraps untrusted text — content extracted from uploaded files
// (including OCR-transcribed pages), and the user's own library/section names, which they could
// still craft adversarially within their own account — in XML-style tags. Without escaping, a piece
// of that text containing a literal closing tag followed by a forged opening one could close the
// untrusted-data envelope early and open what looks to the model like a new, trusted instruction
// block, defeating the system prompt's rule that only the real question block is the request.
//
// Escaping `<`/`>` to HTML entities neutralizes any such structural markup without losing
// information, since this is plain text read by an LLM, not HTML being rendered.
//
// Every prompt builder imports this rather than reimplementing it: three near-copies that drift
// apart would be a security hole, not a style wart.
export function escapeForPrompt(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
