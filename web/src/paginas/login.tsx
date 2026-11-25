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
      await api("/api/auth/login", { method: "POST", body: { email: correo, contrasena } });
      await recargar();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo ingresar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#1e283c] px-4 py-12">
      <div className="w-full max-w-[400px]">
        <img
          src="/logo-recoleta-blanco.png"
          alt="Municipalidad de Recoleta. Somos todos."
          width={600}
          height={231}
          fetchPriority="high"
          className="mx-auto mb-8 h-auto w-[min(100%,320px)]"
        />
        <form onSubmit={enviar} className="grid gap-4 rounded-2xl bg-white p-6 shadow-[0_24px_60px_rgba(0,0,0,.28)]" noValidate>
          <h1 className="text-[22px] font-semibold tracking-tight">Ingreso</h1>
          {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-alert">{error}</p> : null}
          <label className="grid gap-1.5 text-sm font-medium" htmlFor="correo">
            Correo
            <input id="correo" className="h-11 rounded-lg border border-line px-3 text-base font-normal outline-none focus:border-ink" type="email" autoComplete="username" required value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium" htmlFor="contrasena">
            Contraseña
            <input id="contrasena" className="h-11 rounded-lg border border-line px-3 text-base font-normal outline-none focus:border-ink" type="password" autoComplete="current-password" required value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
          </label>
          <button className="mt-1 h-11 rounded-lg bg-[#1e283c] text-sm font-semibold text-white disabled:opacity-60" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
