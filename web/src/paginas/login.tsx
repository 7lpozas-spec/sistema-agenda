import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export function Login() {
  const { usuario, listo, recargar } = useAuth();
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    document.title = "Ingreso · Licencias Recoleta";
  }, []);

  if (listo && usuario) return <Navigate to="/" replace />;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: { email: correo, contrasena },
      });
      await recargar();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo ingresar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-shell">
      <section className="login-brand" aria-label="Licencias de conducir">
        <img
          src="/logo-recoleta-blanco.png"
          alt="Municipalidad de Recoleta. Somos todos."
          width={600}
          height={231}
          fetchPriority="high"
          className="mb-8 h-auto w-[min(100%,220px)]"
        />
      </section>
      <div className="login-form-area">
        <div className="w-full max-w-[400px]">
          <form
            onSubmit={enviar}
            className="superficie mt-3 grid gap-5 p-6 sm:p-8"
            noValidate
          >
            <h1 className="page-title">Ingreso</h1>
            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-alert"
              >
                {error}
              </p>
            ) : null}
            <label
              className="grid gap-1.5 text-sm font-medium"
              htmlFor="correo"
            >
              Correo
              <input
                id="correo"
                className="h-11 rounded-lg border border-line px-3 text-base font-normal outline-none focus:border-ink"
                type="email"
                autoComplete="username"
                required
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
              />
            </label>
            <label
              className="grid gap-1.5 text-sm font-medium"
              htmlFor="contrasena"
            >
              Contraseña
              <input
                id="contrasena"
                className="h-11 rounded-lg border border-line px-3 text-base font-normal outline-none focus:border-ink"
                type="password"
                autoComplete="current-password"
                required
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
              />
            </label>
            <button
              className="mt-1 h-11 rounded-lg bg-sky text-sm font-semibold text-white disabled:opacity-60"
              disabled={enviando}
            >
              {enviando ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
