export interface ShrunkImage {
  bytes: Uint8Array;
  mediaType: string;
  ext: string;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = createEl("img");
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image could not be decoded"));
    };
    img.src = url;
  });
}

function canvasToBytes(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("toBlob failed"));
        blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
      },
      type,
      quality,
    );
  });
}

/**
 * Kích thước khai báo trong SVG (width/height, hoặc viewBox). SVG chỉ có viewBox thì trình duyệt báo
 * naturalWidth = 0 → phải tự đọc, không thì ảnh thành 1×1 trắng.
 */
export function svgSize(text: string): { w: number; h: number } | null {
  const tag = text.match(/<svg\b[^>]*>/i)?.[0];
  if (!tag) return null;
  const num = (name: string) => {
    const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px)?\\s*["']`, "i"));
    return m ? Number(m[1]) : NaN;
  };
  const w = num("width");
  const h = num("height");
  if (w > 0 && h > 0) return { w, h };
  const vb = tag.match(/\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i);
  if (vb && Number(vb[1]) > 0 && Number(vb[2]) > 0) return { w: Number(vb[1]), h: Number(vb[2]) };
  return null;
}

/**
 * Thu nhỏ ảnh cho màn e-ink (chiều rộng tối đa maxWidth), xuất JPEG.
 * PNG đủ nhỏ thì giữ nguyên. Không đọc được (svg lỗi, định dạng lạ) → null.
 */
export async function shrinkImage(bytes: Uint8Array, mediaType: string, maxWidth: number, quality: number): Promise<ShrunkImage | null> {
  const type = mediaType.split(";")[0].trim().toLowerCase();
  let img: HTMLImageElement;
  try {
    img = await loadImage(new Blob([bytes.slice().buffer], { type }));
  } catch {
    return null;
  }
  // PNG nhỏ giữ nguyên. JPEG thì LUÔN nén lại: CrossPoint không hiện JPEG progressive, còn canvas xuất baseline.
  if (type === "image/png" && img.naturalWidth > 0 && img.naturalWidth <= maxWidth) return { bytes, mediaType: type, ext: "png" };

  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (!w || !h) {
    const declared = type === "image/svg+xml" ? svgSize(new TextDecoder().decode(bytes.slice(0, 4096))) : null;
    if (!declared) return null;
    // SVG vẽ nét: phóng tới chiều rộng tối đa cho nét
    w = maxWidth;
    h = Math.round((declared.h / declared.w) * maxWidth);
  }
  const scale = Math.min(1, maxWidth / w);
  const canvas = createEl("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.min(8000, Math.round(h * scale)));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  try {
    return { bytes: await canvasToBytes(canvas, "image/jpeg", quality), mediaType: "image/jpeg", ext: "jpg" };
  } catch {
    return null;
  } finally {
    canvas.width = canvas.height = 0;
  }
}
