import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ErrorApi } from "./api";

export type Rol = "ADMIN" | "OPERADOR_AGENDA" | "INSTRUCTOR";

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

export interface Oficina {
  nombre: string;
  direccion: string;
  entorno: string;
}

interface Sesion {
  usuario: Usuario | null;
  oficina: Oficina | null;
  listo: boolean;
  recargar: () => Promise<void>;
  salir: () => Promise<void>;
}

const Contexto = createContext<Sesion | null>(null);

export function ProveedorAuth({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [oficina, setOficina] = useState<Oficina | null>(null);
  const [listo, setListo] = useState(false);

  async function recargar() {
    try {
      const datos = await api<{ usuario: Usuario; oficina: Oficina }>("/api/auth/yo");
      setUsuario(datos.usuario);
      setOficina(datos.oficina);
    } catch (error) {
      if (error instanceof ErrorApi && (error.codigo === "NO_AUTENTICADO" || error.codigo === "SESION_EXPIRADA")) {
        setUsuario(null);
      } else {
        setUsuario(null);
      }
    } finally {
      setListo(true);
    }
  }

  useEffect(() => {
    void recargar();
  }, []);

  async function salir() {
    await api("/api/auth/logout", { method: "POST", body: {} });
    setUsuario(null);
  }

  return <Contexto.Provider value={{ usuario, oficina, listo, recargar, salir }}>{children}</Contexto.Provider>;
}

export function useAuth(): Sesion {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("Falta el proveedor de sesión.");
  return valor;
}

export const NOMBRE_ROL: Record<Rol, string> = {
  ADMIN: "Administración",
  OPERADOR_AGENDA: "Operador de agenda",
  INSTRUCTOR: "Instructor",
};
