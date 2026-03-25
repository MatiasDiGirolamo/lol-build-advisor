# LoL Build Advisor

MVP full-stack para detectar una partida activa de League of Legends y sugerir ajustes de build en base a composicion rival, amenazas de la partida y, cuando esta disponible, items en vivo leidos desde el cliente local.

## Que hace hoy

- Busca una partida activa por `Riot ID + tag + servidor` usando Riot API.
- Enriquece el scouting con rank visible y champion mastery del lobby.
- Detecta una partida local leyendo `Live Client Data API` desde `https://127.0.0.1:2999`.
- Muestra presets pregame basados en meta real actual extraido desde Mobalytics por campeon y rol.
- Genera prioridades de build y ajustes situacionales.
- Puede sumar una capa de IA opcional si definis `OPENAI_API_KEY`.

## Limites importantes

- El modo oficial de Riot (`Spectator V5`) no expone los items vivos de la partida.
- Para recomendaciones basadas en items actuales, hace falta el modo local con el juego abierto en la misma PC.
- El login oficial con Riot (`RSO`) no esta implementado en este MVP porque requiere una app aprobada para produccion.
- La capa pregame depende del markup publico actual del proveedor meta; si cambia, la app vuelve a presets internos de respaldo.

## Estructura

- `client`: React + Vite.
- `server`: Express con integracion Riot API, Data Dragon, Live Client Data API y capa opcional de IA.

## Como correrlo

### 1. Backend

```bash
cd server
copy .env.example .env
npm install
npm run dev
```

### 2. Frontend

```bash
cd client
npm install
npm run dev
```

El frontend levanta en Vite y proxyea `/api` al backend en `http://localhost:4000`.

## Variables de entorno

Backend en `server/.env`:

```env
PORT=4000
RIOT_API_KEY=your-riot-api-key
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
```

## Siguiente paso recomendado

Implementar autenticacion `RSO` y persistencia de perfiles para que el usuario pueda iniciar sesion con Riot, guardar servidores preferidos y analizar partidas sin cargar manualmente el Riot ID.
