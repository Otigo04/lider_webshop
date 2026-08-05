"use client";

/**
 * Greift nur, wenn das Root-Layout selbst nicht rendern konnte. Header, Footer
 * und die globalen Styles stehen dann nicht zur Verfügung – deshalb eigenes
 * <html> und Inline-Styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          color: "#111827",
          background: "#ffffff",
          margin: 0,
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            Die Anwendung ist nicht erreichbar
          </h1>
          <p style={{ marginTop: "0.75rem", color: "#6b7280" }}>
            Bitte laden Sie die Seite neu. Besteht der Fehler weiter, melden Sie
            sich bei uns.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: "1rem",
                fontSize: "0.75rem",
                color: "#6b7280",
              }}
            >
              Kennung: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "2rem",
              background: "#1f2937",
              color: "#ffffff",
              border: 0,
              borderRadius: "0.375rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  );
}
