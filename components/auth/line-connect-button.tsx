export function LineConnectButton({
  connected,
  message
}: {
  connected: boolean;
  message: { text: string; tone: "success" | "error" } | null;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm" aria-labelledby="line-connect-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="line-connect-title" className="font-medium">เชื่อมต่อ LINE</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {connected
              ? "บัญชีเว็บนี้เชื่อมต่อกับ LINE แล้ว พร้อมสำหรับการรับสลิปผ่าน LINE"
              : "เชื่อมต่อเพื่อใช้ LINE เป็นอีกช่องทางในการส่งสลิปเข้าบัญชีนี้"}
          </p>
        </div>

        {connected ? (
          <span className="inline-flex items-center justify-center rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
            เชื่อมต่อแล้ว
          </span>
        ) : (
          <a
            className="inline-flex items-center justify-center rounded-lg bg-[#06c755] px-4 py-2 font-medium text-white hover:bg-[#05b34c]"
            href="/auth/line"
          >
            เชื่อมต่อด้วย LINE
          </a>
        )}
      </div>

      {message ? (
        <p
          className={message.tone === "success" ? "mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" : "mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"}
          role={message.tone === "success" ? "status" : "alert"}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
