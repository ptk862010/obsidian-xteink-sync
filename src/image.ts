export interface ShrunkImage {
  bytes: Uint8Array;
  mediaType: string;
  ext: string;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("không đọc được ảnh"));
    };
    img.src = url;
  });
}

function canvasToBytes(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("toBlob thất bại"));
        blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
      },
      type,
      quality,
    );
  });
}

/**
 * Thu nhỏ ảnh cho màn e-ink (chiều rộng tối đa maxWidth), xuất JPEG.
 * PNG đủ nhỏ thì giữ nguyên. Không đọc được (svg lỗi, định dạng lạ) → null.
 */
export async function shrinkImage(bytes: Uint8Array, mediaType: string, maxWidth: number, quality: number): Promise<ShrunkImage | null> {
  const type = mediaType.split(";")[0].trim().toLowerCase();
  let img: HTMLImageElement;
  try {
    img = await loadImage(new Blob([bytes.buffer as ArrayBuffer], { type }));
  } catch {
    return null;
  }
  // PNG nhỏ giữ nguyên. JPEG thì LUÔN nén lại: CrossPoint không hiện JPEG progressive, còn canvas xuất baseline.
  if (type === "image/png" && img.naturalWidth <= maxWidth) return { bytes, mediaType: type, ext: "png" };

  const scale = Math.min(1, maxWidth / Math.max(1, img.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  try {
    return { bytes: await canvasToBytes(canvas, "image/jpeg", quality), mediaType: "image/jpeg", ext: "jpg" };
  } catch {
    return null;
  }
}
