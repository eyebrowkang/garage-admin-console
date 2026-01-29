# Garage Admin Console - API

Backend-For-Frontend (BFF) service for Garage Admin Console.

**Tech Stack**: Express 5, TypeScript, Prisma, SQLite/LibSQL

## Development

```bash
pnpm -C api dev        # Start dev server (http://localhost:3001)
pnpm -C api build      # Compile TypeScript
pnpm -C api start      # Run compiled code
pnpm -C api typecheck  # Type check without emit
pnpm -C api lint       # Lint code
```

## Database

```bash
# Run migrations
pnpm -C api npx prisma migrate dev

# Open Prisma Studio
pnpm -C api npx prisma studio

# Generate client after schema changes
pnpm -C api npx prisma generate
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secret"
ENCRYPTION_KEY="32-byte-key"
PORT=3001
ADMIN_PASSWORD="admin"
```

## Documentation

See [DEVELOPMENT.md](../DEVELOPMENT.md) for detailed development guide including:
- API routes
- Database schema
- Authentication
- Proxy pattern
