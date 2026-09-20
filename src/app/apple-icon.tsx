import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
          borderRadius: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            width: 108,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 18,
                height: 18,
                border: "5px solid #ffffff",
                borderRadius: 4,
              }}
            />
            <div
              style={{
                height: 8,
                flex: 1,
                background: "#ffffff",
                borderRadius: 999,
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 18,
                height: 18,
                border: "5px solid #ffffff",
                borderRadius: 4,
              }}
            />
            <div
              style={{
                height: 8,
                flex: 1,
                background: "#ffffff",
                borderRadius: 999,
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 18,
                height: 18,
                border: "5px solid #ffffff",
                borderRadius: 4,
              }}
            />
            <div
              style={{
                height: 8,
                flex: 1,
                background: "#ffffff",
                borderRadius: 999,
              }}
            />
          </div>
        </div>
      </div>
    ),
    size,
  );
}
