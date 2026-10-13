/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** true — приложение работает без сервера: цены, маршрут и адреса считаются на устройстве. */
  readonly VITE_STANDALONE?: string;
  readonly VITE_OSRM_URL?: string;
  readonly VITE_PHOTON_URL?: string;
}
