import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { Menu, Search, X } from "lucide-react";
import { NOMBRE_ROL, useAuth, type Rol } from "./auth";
import { Admin } from "./paginas/admin";
import { Agenda } from "./paginas/agenda";
import { CitaDetalle } from "./paginas/cita";
import { Inicio } from "./paginas/inicio";
import { Login } from "./paginas/login";
import { NuevaCita } from "./paginas/nueva";
import { ConexionViva } from "./vivo";

function puede(rol: Rol, destino: string): boolean {
  if (rol === "ADMIN") return true;
  if (destino.startsWith("/admin")) return false;
  if (destino === "/") return rol !== "INSTRUCTOR";
  if (destino === "/agenda/general") return rol === "OPERADOR_AGENDA";
  if (destino === "/agenda/primera_vez") return rol === "OPERADOR_AGENDA" || rol === "INSTRUCTOR";
  if (destino === "/citas/nueva") return rol === "OPERADOR_AGENDA";
  return true;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Marco />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/agenda/:agenda" element={<Agenda />} />
        <Route path="/citas/nueva" element={<NuevaCita />} />
        <Route path="/citas/:id" element={<CitaDetalle />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Marco() {
  const { usuario, listo, salir } = useAuth();
  const navegar = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const dialogo = useRef<HTMLDialogElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const [consulta, setConsulta] = useState("");
  const [indice, setIndice] = useState(0);

  const enlaces = useMemo(() => {
    if (!usuario) return [];
    const base = [
      ["/", "Dashboard"],
      ["/agenda/general", "Agenda general"],
      ["/agenda/primera_vez", "Primera vez"],
      ["/admin", "Administración"],
    ] as const;
    return base.filter(([href]) => puede(usuario.rol, href));
  }, [usuario]);

  const filtrados = enlaces.filter(([, texto]) => texto.toLowerCase().includes(consulta.trim().toLowerCase()));

  useEffect(() => {
    function tecla(evento: KeyboardEvent) {
      if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        setConsulta("");
        setIndice(0);
        dialogo.current?.showModal();
        window.setTimeout(() => campo.current?.focus(), 0);
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  if (!listo) return <div className="min-h-screen bg-paper" />;
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.rol === "INSTRUCTOR" && location.pathname === "/") return <Navigate to="/agenda/primera_vez" replace />;

  function ir(href: string) {
    setAbierto(false);
    dialogo.current?.close();
    navegar(href);
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <ConexionViva activo />
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-pine text-white shadow-[0_8px_24px_rgb(20_27_43/0.18)]">
        <div className="mx-auto flex h-[4.25rem] max-w-[1440px] items-center gap-4 px-3 sm:h-24 sm:gap-6 sm:px-6">
          <img src="/logo-recoleta-blanco.png" alt="Municipalidad de Recoleta" width={600} height={231} className="h-14 w-auto shrink-0 sm:h-20" />
          <nav aria-label="Secciones" className="hidden min-w-0 flex-1 items-center gap-1 lg:flex">
            {enlaces.map(([href, texto]) => (
              <NavLink
                key={href}
                to={href}
                end={href === "/"}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-sm font-medium ${isActive ? "bg-white text-[#1e283c]" : "text-white/85 hover:bg-white/10"}`
                }
              >
                {texto}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="hidden items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/80 lg:flex"
              onClick={() => {
                setConsulta("");
                setIndice(0);
                dialogo.current?.showModal();
                window.setTimeout(() => campo.current?.focus(), 0);
              }}
            >
              <Search size={14} />
              Buscar
              <kbd className="rounded border border-white/20 px-1 text-[10px]">⌘K</kbd>
            </button>
            <span className="hidden text-right sm:block">
              <span className="block text-sm font-medium">{usuario.nombre}</span>
              <span className="block text-[11px] text-white/60">{NOMBRE_ROL[usuario.rol]}</span>
            </span>
            <button type="button" className="rounded-full px-3 py-1.5 text-sm text-white/80 hover:bg-white/10" onClick={() => void salir().then(() => navegar("/login"))}>
              Salir
            </button>
            <button type="button" className="rounded-md p-2 lg:hidden" aria-label="Abrir menú" onClick={() => setAbierto(true)}>
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>
      {abierto ? (
        <div className="fixed inset-0 z-40 bg-[#1e283c] text-white lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <img src="/logo-recoleta-blanco.png" alt="" className="h-12 w-auto" />
            <button type="button" aria-label="Cerrar menú" onClick={() => setAbierto(false)}><X /></button>
          </div>
          <nav className="grid gap-1 px-3">
            {enlaces.map(([href, texto]) => (
              <button key={href} type="button" className="rounded-xl px-3 py-3 text-left text-lg" onClick={() => ir(href)}>{texto}</button>
            ))}
          </nav>
        </div>
      ) : null}
      <main id="contenido" className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
      <dialog
        ref={dialogo}
        className="w-[min(32rem,calc(100%-2rem))] rounded-2xl border border-line bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/40"
        onClose={() => setConsulta("")}
      >
        <form
          className="grid"
          onSubmit={(evento) => {
            evento.preventDefault();
            const destino = filtrados[indice]?.[0];
            if (destino) ir(destino);
          }}
        >
          <label className="sr-only" htmlFor="comando">Buscar</label>
          <input
            id="comando"
            ref={campo}
            className="border-b border-line px-4 py-3.5 text-base outline-none"
            placeholder="Buscar"
            value={consulta}
            onChange={(evento) => {
              setConsulta(evento.target.value);
              setIndice(0);
            }}
            onKeyDown={(evento) => {
              if (evento.key === "ArrowDown") {
                evento.preventDefault();
                setIndice((n) => Math.min(filtrados.length - 1, n + 1));
              }
              if (evento.key === "ArrowUp") {
                evento.preventDefault();
                setIndice((n) => Math.max(0, n - 1));
              }
            }}
          />
          <ul className="max-h-80 overflow-auto p-2">
            {filtrados.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted">Sin resultados</li> : null}
            {filtrados.map(([href, texto], i) => (
              <li key={href}>
                <button
                  type="button"
                  className={`flex w-full rounded-lg px-3 py-2.5 text-left text-sm ${i === indice ? "bg-paper" : ""}`}
                  onMouseEnter={() => setIndice(i)}
                  onClick={() => ir(href)}
                >
                  {texto}
                </button>
              </li>
            ))}
          </ul>
        </form>
      </dialog>
    </div>
  );
}
