/** Dựng body multipart/form-data bằng tay vì requestUrl của Obsidian không nhận FormData. */
export function buildMultipart(
  fieldName: string,
  fileName: string,
  bytes: Uint8Array,
  fileContentType = "application/octet-stream",
): { body: ArrayBuffer; contentType: string } {
  const boundary = "----XteinkSync" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const enc = new TextEncoder();
  const safeName = fileName.replace(/["\r\n]/g, "_");
  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${safeName}"\r\n` +
      `Content-Type: ${fileContentType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return { body: body.buffer, contentType: `multipart/form-data; boundary=${boundary}` };
}

export function formUrlEncoded(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}
