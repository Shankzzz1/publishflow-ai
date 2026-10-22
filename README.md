# PublishFlow AI — MongoDB Edition

React + TypeScript frontend, Express + TypeScript backend, MongoDB + Mongoose persistence.

## Requirements
- Node.js 20+ and npm
- MongoDB running locally, or a MongoDB Atlas connection string

## Setup
1. `npm install` in the project root.
2. Copy `server/.env.example` to `server/.env`.
3. Set `MONGODB_URI` in `server/.env` (for Atlas, use the provided `mongodb+srv://...` connection string). Never commit credentials.
4. `npm run db:seed` to create demo manuscripts.
5. `npm run dev` to start both services.
6. Open http://localhost:5173 and http://localhost:5000/api/v1/health.

The API connects to MongoDB at startup. No Prisma generation or SQL migrations are required.

## Included
- Dashboard statistics and manuscript list
- Create manuscripts, filter/search, status changes
- Embedded status history with optimistic concurrency
- Zod validation and Mongoose models

## Still to build
Authentication and role-based authorization, secure file uploads, AI metadata generation, n8n workflows, payments, Docker, CI/CD and VPS deployment.

**Development-only scaffold:** current endpoints are unauthenticated and must not be exposed publicly.
