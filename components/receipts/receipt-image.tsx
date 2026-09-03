"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshButton } from "@/components/receipts/refresh-button";

export function ReceiptImage({ url, vendorName }: { url: string | null; vendorName: string | null }) {
  const [hasError, setHasError] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // An SSR image can fail before hydration attaches its error handler.
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setHasError(true);
  }, [url]);

  if (!url || hasError) {
    return (
      <div className="space-y-3 rounded-lg bg-muted p-5">
        <p role="alert" className="text-sm text-muted-foreground">
          โหลดรูปใบเสร็จไม่ได้ หรือลิงก์หมดอายุ กรุณากดโหลดใหม่
        </p>
        <RefreshButton />
      </div>
    );
  }

  return (
    <figure>
      {/* Signed private images should bypass the shared Next.js image optimizer cache. */}
      <img
        ref={imageRef}
        src={url}
        alt={`รูปใบเสร็จ${vendorName ? `จาก ${vendorName}` : ""}`}
        className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg border object-contain"
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
      />
      <figcaption className="mt-3 text-center text-sm">
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
          เปิดรูปขนาดเต็ม
        </a>
      </figcaption>
    </figure>
  );
}
