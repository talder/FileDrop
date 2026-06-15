/**
 * SOAP envelope construction for integrations (template mode).
 *
 * Pure / dependency-free so it can be unit-tested directly under
 * `node --test` type-stripping, unlike the runner which pulls in fs/db.
 */

export interface EnvelopeTokens {
  /** The source file content. */
  payload: string;
  /** The (optionally timestamped/custom) outbound source file name. */
  filename: string;
}

/**
 * Substitute the supported tokens in a SOAP envelope template:
 *   {PAYLOAD}  → the source file content
 *   {FILENAME} → the outbound source file name
 *
 * Substitution is a single pass over the template, so content inserted for one
 * token is never re-scanned for another (e.g. a payload that literally contains
 * "{FILENAME}", or a filename that contains "{PAYLOAD}", is left intact).
 * Unknown tokens are preserved verbatim. An empty template defaults to
 * "{PAYLOAD}" (content only), matching behavior prior to {FILENAME} support.
 */
export function applyEnvelopeTemplate(template: string, tokens: EnvelopeTokens): string {
  const tpl = template || "{PAYLOAD}";
  return tpl.replace(/\{(PAYLOAD|FILENAME)\}/g, (_match, token: string) =>
    token === "FILENAME" ? tokens.filename : tokens.payload,
  );
}
